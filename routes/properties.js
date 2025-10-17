const express = require('express');
const { body, validationResult } = require('express-validator');
const Property = require('../models/Property');
const { auth, adminOnly } = require('../middleware/auth');
const { cloudinary, upload, USE_CLOUDINARY } = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// @route   GET /api/properties
// @desc    Get all properties with filters
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      city,
      minPrice,
      maxPrice,
      propertyType,
      bedrooms,
      isAvailable,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const query = {};

    // Build filter query
    if (search) {
      query.$text = { $search: search };
    }

    if (city) {
      query['location.city'] = new RegExp(city, 'i');
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (propertyType) {
      query.propertyType = propertyType;
    }

    if (bedrooms) {
      query.bedrooms = Number(bedrooms);
    }

    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === 'true';
    }

    const sortOptions = {};
    sortOptions[sortBy] = order === 'desc' ? -1 : 1;

    const properties = await Property.find(query)
      .populate('owner', 'name email')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Property.countDocuments(query);

    res.json({
      success: true,
      data: {
        properties,
        totalPages: Math.ceil(count / limit),
        currentPage: Number(page),
        total: count
      }
    });
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching properties'
    });
  }
});

// @route   GET /api/properties/:id
// @desc    Get single property by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('owner', 'name email avatar');

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Increment views
    property.views += 1;
    await property.save();

    res.json({
      success: true,
      data: { property }
    });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching property'
    });
  }
});

// @route   POST /api/properties
// @desc    Create new property
// @access  Private
router.post('/', auth, upload.array('images', 5), async (req, res) => {
  console.log('🏠 ========== CREATE PROPERTY REQUEST RECEIVED ==========');
  console.log('👤 User:', req.user?._id);
  console.log('📁 Files:', req.files?.length || 0);
  console.log('📝 Body data:', req.body.data);
  
  try {
    // Parse the JSON data first
    const propertyData = JSON.parse(req.body.data || '{}');
    console.log('📦 Parsed property data:', propertyData);
    
    // Manual validation after parsing
    const errors = [];
    
    if (!propertyData.title || propertyData.title.trim() === '') {
      errors.push({ field: 'title', message: 'Title is required' });
    }
    
    if (!propertyData.description || propertyData.description.trim() === '') {
      errors.push({ field: 'description', message: 'Description is required' });
    }
    
    if (!propertyData.price || isNaN(propertyData.price)) {
      errors.push({ field: 'price', message: 'Price must be a valid number' });
    }
    
    if (!propertyData.location?.address || propertyData.location.address.trim() === '') {
      errors.push({ field: 'location.address', message: 'Address is required' });
    }
    
    if (!propertyData.location?.city || propertyData.location.city.trim() === '') {
      errors.push({ field: 'location.city', message: 'City is required' });
    }
    
    if (!propertyData.location?.country || propertyData.location.country.trim() === '') {
      errors.push({ field: 'location.country', message: 'Country is required' });
    }
    
    if (errors.length > 0) {
      console.log('❌ Validation failed:', errors);
      // Delete uploaded files if validation fails
      if (req.files && req.files.length > 0) {
        if (USE_CLOUDINARY) {
          req.files.forEach(file => {
            if (file.filename) {
              cloudinary.uploader.destroy(file.filename).catch(err => console.error('Error deleting from Cloudinary:', err));
            }
          });
        } else {
          req.files.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
      }
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }
    console.log('✅ Validation passed');
    
    propertyData.owner = req.user._id;

    // Add uploaded image paths/URLs
    if (req.files && req.files.length > 0) {
      if (USE_CLOUDINARY) {
        propertyData.images = req.files.map(file => file.path); // Cloudinary URL
        console.log('📸 Images uploaded to Cloudinary:', propertyData.images);
      } else {
        propertyData.images = req.files.map(file => `/uploads/properties/${file.filename}`); // Local path
        console.log('📸 Images saved locally:', propertyData.images);
      }
    }

    console.log('💾 Creating property in database...');
    const property = await Property.create(propertyData);
    console.log('✅ Property created successfully:', property._id);

    res.status(201).json({
      success: true,
      message: 'Property created successfully',
      data: { property }
    });
  } catch (error) {
    console.error('❌ Create property error:', error);
    // Delete uploaded files if property creation fails
    if (req.files && req.files.length > 0) {
      if (USE_CLOUDINARY) {
        req.files.forEach(file => {
          if (file.filename) {
            cloudinary.uploader.destroy(file.filename).catch(err => console.error('Error deleting from Cloudinary:', err));
          }
        });
      } else {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
    }
    res.status(500).json({
      success: false,
      message: 'Server error while creating property'
    });
  }
});

// @route   PUT /api/properties/:id
// @desc    Update property
// @access  Private (Owner or Admin)
router.put('/:id', auth, upload.array('images', 5), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      // Delete uploaded files if property not found
      if (req.files && req.files.length > 0) {
        if (USE_CLOUDINARY) {
          req.files.forEach(file => {
            if (file.filename) {
              cloudinary.uploader.destroy(file.filename).catch(err => console.error('Error deleting from Cloudinary:', err));
            }
          });
        } else {
          req.files.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
      }
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Check ownership or admin
    if (property.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      // Delete uploaded files if unauthorized
      if (req.files && req.files.length > 0) {
        if (USE_CLOUDINARY) {
          req.files.forEach(file => {
            if (file.filename) {
              cloudinary.uploader.destroy(file.filename).catch(err => console.error('Error deleting from Cloudinary:', err));
            }
          });
        } else {
          req.files.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
      }
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this property'
      });
    }

    const updateData = JSON.parse(req.body.data || '{}');

    // Add new uploaded images
    if (req.files && req.files.length > 0) {
      const newImages = USE_CLOUDINARY 
        ? req.files.map(file => file.path) // Cloudinary URLs
        : req.files.map(file => `/uploads/properties/${file.filename}`); // Local paths
      updateData.images = [...(property.images || []), ...newImages];
    }

    const updatedProperty = await Property.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('owner', 'name email');

    res.json({
      success: true,
      message: 'Property updated successfully',
      data: { property: updatedProperty }
    });
  } catch (error) {
    console.error('Update property error:', error);
    // Delete uploaded files if update fails
    if (req.files && req.files.length > 0) {
      if (USE_CLOUDINARY) {
        req.files.forEach(file => {
          if (file.filename) {
            cloudinary.uploader.destroy(file.filename).catch(err => console.error('Error deleting from Cloudinary:', err));
          }
        });
      } else {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating property'
    });
  }
});

// @route   DELETE /api/properties/:id
// @desc    Delete property
// @access  Private (Owner or Admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Check ownership or admin
    if (property.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this property'
      });
    }

    // Delete associated images
    if (property.images && property.images.length > 0) {
      if (USE_CLOUDINARY) {
        property.images.forEach(imageUrl => {
          // Extract public_id from Cloudinary URL
          const match = imageUrl.match(/\/property-rental\/properties\/([^/.]+)/);
          if (match && match[1]) {
            const publicId = `property-rental/properties/${match[1]}`;
            cloudinary.uploader.destroy(publicId).catch(err => console.error('Error deleting from Cloudinary:', err));
          }
        });
      } else {
        property.images.forEach(imagePath => {
          const fullPath = path.join(__dirname, '..', imagePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        });
      }
    }

    await Property.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Property deleted successfully'
    });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting property'
    });
  }
});

// @route   GET /api/properties/user/my-properties
// @desc    Get current user's properties
// @access  Private
router.get('/user/my-properties', auth, async (req, res) => {
  try {
    const properties = await Property.find({ owner: req.user._id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { properties }
    });
  } catch (error) {
    console.error('Get user properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user properties'
    });
  }
});

module.exports = router;

