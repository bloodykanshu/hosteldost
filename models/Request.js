const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  destination: { type: String, required: true },
  category: { type: String, required: true },
  time: { type: String, required: true },
  mode: { type: String, required: true },
  genderFilter: { type: String, enum: ['Any Gender', 'Girls Only', 'Boys Only'], default: 'Any Gender' },
  spots: { type: Number, required: true, default: 3 },
  fare: { type: Number, required: true, default: 0 },
  hostName: { type: String, required: true },
  room: { type: String, required: true },
  contact: { type: String, required: true },
  description: { type: String, required: true },
  userId: { type: String, default: null },
  joinedUsers: [{
    userId: String,
    name: String,
    room: String,
    joinedAt: { type: Date, default: Date.now }
  }],
  coverImage: { type: String, default: 'https://images.unsplash.com/photo-1515165562839-97840135d070?w=600' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Request', requestSchema);
