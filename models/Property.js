const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  location: {
    address: {
      type: String,
      required: [true, 'Address is required']
    },
    city: {
      type: String,
      required: [true, 'City is required']
    },
    state: {
      type: String,
      required: false
    },
    country: {
      type: String,
      required: [true, 'Country is required']
    },
    zipCode: {
      type: String,
      required: false
    },
    coordinates: {
      latitude: {
        type: Number,
        required: false
      },
      longitude: {
        type: Number,
        required: false
      }
    }
  },
  images: [{
    type: String,
    required: true
  }],
  propertyType: {
    type: String,
    enum: ['apartment', 'house', 'villa', 'condo', 'studio', 'other'],
    default: 'apartment'
  },
  bedrooms: {
    type: Number,
    required: false,
    min: 0
  },
  bathrooms: {
    type: Number,
    required: false,
    min: 0
  },
  area: {
    value: Number,
    unit: {
      type: String,
      enum: ['sqft', 'sqm'],
      default: 'sqft'
    }
  },
  amenities: [{
    type: String,
    trim: true
  }],
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for better search performance
propertySchema.index({ title: 'text', description: 'text', 'location.city': 'text' });
propertySchema.index({ price: 1 });
propertySchema.index({ 'location.city': 1 });
propertySchema.index({ isAvailable: 1 });

// Virtual for full address
propertySchema.virtual('fullAddress').get(function() {
  return `${this.location.address}, ${this.location.city}, ${this.location.country}`;
});

// Ensure virtual fields are serialized
propertySchema.set('toJSON', { virtuals: true });
propertySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Property', propertySchema);

