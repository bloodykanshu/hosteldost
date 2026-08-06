const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const User = require('./models/User');
const Request = require('./models/Request');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files (styles.css, app.js, index.html, assets)
app.use(express.static(path.join(__dirname)));

// Connect to MongoDB Atlas Cloud Database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://akanshyadav91_db_user:HostelBuddy123@akansh.7ur9ofm.mongodb.net/hostelbuddy?retryWrites=true&w=majority&appName=Akansh';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas Cloud Database (Akansh Cluster)!'))
  .catch(err => console.error('❌ MongoDB Atlas Connection Error:', err.message));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', connected: mongoose.connection.readyState === 1 });
});

/* ==========================================================================
   AUTH ROUTES
   ========================================================================== */

// POST /api/auth/register - Registration with Gender Selection
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, gender, block, room, password } = req.body;

    if (!phone || phone.trim().length < 10) {
      return res.status(400).json({ message: 'Mandatory phone number is required.' });
    }

    const cleanPhone = phone.trim();

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'HB';
    const fullRoom = `${block} - ${room}`;

    const newUser = new User({
      name,
      email: email.toLowerCase(),
      phone: cleanPhone,
      gender: gender || 'Male',
      block,
      room: fullRoom,
      initials,
      password: hashedPassword,
      isPhoneVerified: true
    });

    await newUser.save();

    const userResponse = {
      id: newUser._id.toString(),
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      gender: newUser.gender,
      block: newUser.block,
      room: newUser.room,
      initials: newUser.initials
    };

    res.status(201).json({ message: 'Account created successfully in MongoDB Atlas!', user: userResponse });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration.', error: error.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid student email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid student email or password.' });
    }

    const userResponse = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone || 'N/A',
      gender: user.gender || 'Male',
      block: user.block,
      room: user.room,
      initials: user.initials
    };

    res.json({ message: 'Signed in successfully!', user: userResponse });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login.', error: error.message });
  }
});

// DELETE /api/auth/profile/:userId - Permanently Delete Account
app.delete('/api/auth/profile/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    await User.findByIdAndDelete(userId);
    await Request.deleteMany({ userId });
    await Request.updateMany(
      {},
      { $pull: { joinedUsers: { userId } } }
    );

    res.json({ message: 'Profile and associated posts deleted permanently from MongoDB Atlas!' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user profile.', error: error.message });
  }
});

/* ==========================================================================
   TRAVEL REQUEST ROUTES
   ========================================================================== */

// GET /api/requests
app.get('/api/requests', async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching travel requests.', error: error.message });
  }
});

// POST /api/requests
app.post('/api/requests', async (req, res) => {
  try {
    const { destination, category, time, mode, genderFilter, spots, fare, hostName, room, contact, description, userId } = req.body;

    const defaultCovers = [
      'https://images.unsplash.com/photo-1515165562839-97840135d070?w=600',
      'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=600',
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600',
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600'
    ];

    const newRequest = new Request({
      destination,
      category,
      time,
      mode,
      genderFilter: genderFilter || 'Any Gender',
      spots,
      fare,
      hostName,
      room,
      contact,
      description,
      userId: userId || null,
      joinedUsers: [],
      coverImage: defaultCovers[Math.floor(Math.random() * defaultCovers.length)]
    });

    await newRequest.save();
    res.status(201).json({ message: 'Travel request posted to MongoDB Atlas!', request: newRequest });
  } catch (error) {
    res.status(500).json({ message: 'Error creating travel request.', error: error.message });
  }
});

// POST /api/requests/:id/join - Join a trip & decrement available spots in MongoDB Atlas
app.post('/api/requests/:id/join', async (req, res) => {
  try {
    const requestId = req.params.id;
    const { userId, name, room } = req.body;

    const reqItem = await Request.findById(requestId);
    if (!reqItem) {
      return res.status(404).json({ message: 'Travel request not found.' });
    }

    if (reqItem.spots <= 0) {
      return res.status(400).json({ message: 'Sorry, no spots remaining for this travel request!' });
    }

    const alreadyJoined = reqItem.joinedUsers.some(u => u.userId === userId || (u.name === name && u.room === room));
    if (alreadyJoined) {
      return res.status(400).json({ message: 'You have already joined this travel request!' });
    }

    reqItem.spots -= 1;
    reqItem.joinedUsers.push({ userId, name, room });

    await reqItem.save();

    res.json({
      message: `Successfully joined ${reqItem.destination}!`,
      request: reqItem
    });
  } catch (error) {
    res.status(500).json({ message: 'Error joining travel request.', error: error.message });
  }
});

// Fallback route for non-API web pages
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API Endpoint Not Found' });
  }

  if (path.extname(req.path)) {
    return res.status(404).send('File not found');
  }

  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Hostel Buddiieess Server running on http://localhost:${PORT}`);
});
