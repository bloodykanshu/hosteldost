const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Request = require('./models/Request');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas Cloud Database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://akanshyadav91_db_user:mnBIKeFHcQ1BU0Zv@akansh.7ur9ofm.mongodb.net/hostelbuddy?retryWrites=true&w=majority&appName=Akansh';

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

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, block, room, password } = req.body;

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
      block,
      room: fullRoom,
      initials,
      password: hashedPassword
    });

    await newUser.save();

    const userResponse = {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
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
      id: user._id,
      name: user.name,
      email: user.email,
      block: user.block,
      room: user.room,
      initials: user.initials
    };

    res.json({ message: 'Signed in successfully!', user: userResponse });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login.', error: error.message });
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
    const { destination, category, time, mode, spots, fare, hostName, room, contact, description, userId } = req.body;

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
      spots,
      fare,
      hostName,
      room,
      contact,
      description,
      userId: userId || null,
      coverImage: defaultCovers[Math.floor(Math.random() * defaultCovers.length)]
    });

    await newRequest.save();
    res.status(201).json({ message: 'Travel request posted to MongoDB Atlas!', request: newRequest });
  } catch (error) {
    res.status(500).json({ message: 'Error creating travel request.', error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 HostelBuddy Server running on http://localhost:${PORT}`);
});
