const express = require('express');
const { body, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Property = require('../models/Property');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/bookings
// @desc    Get all bookings (user's own or all for admin)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = req.user.role === 'admin' ? {} : { user: req.user._id };

    if (status) {
      query.status = status;
    }

    const bookings = await Booking.find(query)
      .populate('property', 'title price images location')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Booking.countDocuments(query);

    res.json({
      success: true,
      data: {
        bookings,
        totalPages: Math.ceil(count / limit),
        currentPage: Number(page),
        total: count
      }
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bookings'
    });
  }
});

// @route   GET /api/bookings/:id
// @desc    Get single booking by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('property', 'title price images location owner')
      .populate('user', 'name email');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns the booking or is admin or property owner
    if (
      booking.user._id.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin' &&
      booking.property.owner.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this booking'
      });
    }

    res.json({
      success: true,
      data: { booking }
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching booking'
    });
  }
});

// @route   POST /api/bookings
// @desc    Create new booking
// @access  Private
router.post('/', auth, [
  body('property').notEmpty().withMessage('Property ID is required'),
  body('checkIn').isISO8601().withMessage('Valid check-in date is required'),
  body('checkOut').isISO8601().withMessage('Valid check-out date is required'),
  body('guests').isInt({ min: 1 }).withMessage('Number of guests must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { property: propertyId, checkIn, checkOut, guests, specialRequests } = req.body;

    // Check if property exists and is available
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    if (!property.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Property is not available for booking'
      });
    }

    // Check for date conflicts
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    const conflictingBooking = await Booking.findOne({
      property: propertyId,
      status: { $in: ['pending', 'confirmed'] },
      $or: [
        { checkIn: { $lte: checkOutDate }, checkOut: { $gte: checkInDate } }
      ]
    });

    if (conflictingBooking) {
      return res.status(400).json({
        success: false,
        message: 'Property is already booked for selected dates'
      });
    }

    // Calculate total price
    const days = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    const totalPrice = property.price * days;

    const booking = await Booking.create({
      property: propertyId,
      user: req.user._id,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests,
      totalPrice,
      specialRequests
    });

    const populatedBooking = await Booking.findById(booking._id)
      .populate('property', 'title price images location')
      .populate('user', 'name email');

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: { booking: populatedBooking }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating booking'
    });
  }
});

// @route   PUT /api/bookings/:id
// @desc    Update booking status
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('property');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check authorization (user owns booking, property owner, or admin)
    const isOwner = booking.user.toString() === req.user._id.toString();
    const isPropertyOwner = booking.property.owner.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isPropertyOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this booking'
      });
    }

    const { status, paymentStatus } = req.body;
    const updateData = {};

    if (status) {
      updateData.status = status;
      if (status === 'cancelled') {
        updateData.cancelledAt = new Date();
        if (req.body.cancellationReason) {
          updateData.cancellationReason = req.body.cancellationReason;
        }
      }
    }

    if (paymentStatus && (isPropertyOwner || isAdmin)) {
      updateData.paymentStatus = paymentStatus;
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('property', 'title price images location')
      .populate('user', 'name email');

    res.json({
      success: true,
      message: 'Booking updated successfully',
      data: { booking: updatedBooking }
    });
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating booking'
    });
  }
});

// @route   DELETE /api/bookings/:id
// @desc    Delete booking
// @access  Private (Admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    await Booking.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Booking deleted successfully'
    });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting booking'
    });
  }
});

// @route   GET /api/bookings/property/:propertyId
// @desc    Get all bookings for a property
// @access  Private (Property owner or Admin)
router.get('/property/:propertyId', auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Check authorization
    if (property.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view property bookings'
      });
    }

    const bookings = await Booking.find({ property: req.params.propertyId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { bookings }
    });
  } catch (error) {
    console.error('Get property bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching property bookings'
    });
  }
});

module.exports = router;

