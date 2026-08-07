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

// Serve static frontend files
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

const DEFAULT_COVERS = {
  '✈️ Transit & Airport': 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop',
  '🛍️ Malls & Shopping': 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=800&auto=format&fit=crop',
  '🍔 Cafes & Food': 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&auto=format&fit=crop',
  '🎬 Movies & Outing': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop',
  '📚 College & Exams': 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop',
  '🏥 Medical & Urgent': 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=800&auto=format&fit=crop'
};

// 24-Hour Edit & Delete Lock Rule Verification
function canModifyTripServer(reqItem) {
  if (!reqItem || !reqItem.time) return true;
  try {
    const timeStr = reqItem.time || '';
    const parts = timeStr.split(',');
    if (parts.length >= 2) {
      const datePart = parts[0].trim().toLowerCase();
      const timePart = parts[1].trim();

      const today = new Date();
      let departureDate = new Date();

      if (datePart === 'today') {
        departureDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      } else if (datePart === 'tomorrow') {
        departureDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      } else {
        departureDate = new Date(parts[0].trim());
      }

      const timeMatch = timePart.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (timeMatch && !isNaN(departureDate.getTime())) {
        let hrs = parseInt(timeMatch[1], 10);
        const mins = parseInt(timeMatch[2], 10);
        const ampm = timeMatch[3].toUpperCase();
        if (ampm === 'PM' && hrs < 12) hrs += 12;
        if (ampm === 'AM' && hrs === 12) hrs = 0;
        departureDate.setHours(hrs, mins, 0, 0);
      }

      if (!isNaN(departureDate.getTime())) {
        const diffMs = departureDate.getTime() - Date.now();
        const diffHours = diffMs / (1000 * 60 * 60);
        return diffHours >= 24;
      }
    }
  } catch (e) {}
  return true;
}

/* ==========================================================================
   AUTH ROUTES
   ========================================================================== */

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, emergencyPhone, gender, block, room, password } = req.body;

    if (!phone || phone.trim().length < 10) {
      return res.status(400).json({ message: 'Mandatory phone number is required.' });
    }

    const cleanPhone = phone.trim();
    const cleanEmergencyPhone = emergencyPhone ? emergencyPhone.trim() : '';

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'SC';
    const fullRoom = `${block} - ${room}`;

    const newUser = new User({
      name,
      email: email.toLowerCase(),
      phone: cleanPhone,
      emergencyPhone: cleanEmergencyPhone,
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
      emergencyPhone: newUser.emergencyPhone,
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
      emergencyPhone: user.emergencyPhone || '',
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

app.get('/api/requests', async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    const sanitizedRequests = requests.map(r => {
      const obj = r.toObject();
      const cover = DEFAULT_COVERS[obj.category] || (obj.coverImage && obj.coverImage.startsWith('http') ? obj.coverImage : 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop');

      return {
        ...obj,
        pickup: obj.pickup || 'Hostel Gate',
        coverImage: cover,
        hostAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(obj.hostName || 'Student')}&background=8B5CF6&color=fff&bold=true`,
        fare: Math.min(Math.max(0, Number(obj.fare) || 0), 10000),
        spots: Math.min(Math.max(0, Number(obj.spots) || 0), 10)
      };
    });
    res.json(sanitizedRequests);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching travel requests.', error: error.message });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const { pickup, destination, category, time, mode, genderFilter, spots, fare, hostName, room, contact, description, userId } = req.body;

    const sanitizedFare = Math.min(Math.max(0, Number(fare) || 0), 10000);
    const sanitizedSpots = Math.min(Math.max(1, Number(spots) || 1), 10);
    const coverImage = DEFAULT_COVERS[category] || 'https://images.unsplash.com/photo-1515165562839-97840135d070?w=600&auto=format&fit=crop';

    const newRequest = new Request({
      pickup: pickup || 'Hostel Gate',
      destination,
      category,
      time,
      mode,
      genderFilter: genderFilter || 'Any Gender',
      spots: sanitizedSpots,
      fare: sanitizedFare,
      hostName,
      room,
      contact,
      description,
      userId: userId || null,
      joinedUsers: [],
      coverImage
    });

    await newRequest.save();

    const responseObj = {
      ...newRequest.toObject(),
      hostAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(hostName)}&background=8B5CF6&color=fff&bold=true`
    };

    res.status(201).json({ message: 'Travel request posted to MongoDB Atlas!', request: responseObj });
  } catch (error) {
    res.status(500).json({ message: 'Error creating travel request.', error: error.message });
  }
});

// PUT /api/requests/:id - Host edits a travel request (with 24-hour lock check)
app.put('/api/requests/:id', async (req, res) => {
  try {
    const requestId = req.params.id;
    const { pickup, destination, category, time, mode, genderFilter, spots, fare, description, userId } = req.body;

    const reqItem = await Request.findById(requestId);
    if (!reqItem) {
      return res.status(404).json({ message: 'Travel request not found.' });
    }

    if (userId && reqItem.userId && reqItem.userId !== userId) {
      return res.status(403).json({ message: 'Only the host can edit this travel request.' });
    }

    // Verify 24-Hour Policy Lock
    if (!canModifyTripServer(reqItem)) {
      return res.status(400).json({ message: '🔒 Modification locked: Trips within 24 hours of departure cannot be edited.' });
    }

    const sanitizedFare = Math.min(Math.max(0, Number(fare) || 0), 10000);
    const sanitizedSpots = Math.min(Math.max(1, Number(spots) || 1), 10);
    const coverImage = DEFAULT_COVERS[category] || reqItem.coverImage;

    reqItem.pickup = pickup || reqItem.pickup || 'Hostel Gate';
    reqItem.destination = destination || reqItem.destination;
    reqItem.category = category || reqItem.category;
    reqItem.time = time || reqItem.time;
    reqItem.mode = mode || reqItem.mode;
    reqItem.genderFilter = genderFilter || reqItem.genderFilter;
    reqItem.spots = sanitizedSpots;
    reqItem.fare = sanitizedFare;
    reqItem.description = description || reqItem.description;
    reqItem.coverImage = coverImage;

    await reqItem.save();

    res.json({ message: 'Travel plan updated successfully!', request: reqItem });
  } catch (error) {
    res.status(500).json({ message: 'Error updating travel request.', error: error.message });
  }
});

// DELETE /api/requests/:id - Host deletes a travel request (with 24-hour lock check)
app.delete('/api/requests/:id', async (req, res) => {
  try {
    const requestId = req.params.id;
    const { userId } = req.body || {};

    const reqItem = await Request.findById(requestId);
    if (!reqItem) {
      return res.status(404).json({ message: 'Travel request not found.' });
    }

    if (userId && reqItem.userId && reqItem.userId !== userId) {
      return res.status(403).json({ message: 'Only the host can delete this travel request.' });
    }

    // Verify 24-Hour Policy Lock
    if (!canModifyTripServer(reqItem)) {
      return res.status(400).json({ message: '🔒 Modification locked: Trips within 24 hours of departure cannot be deleted.' });
    }

    await Request.findByIdAndDelete(requestId);
    res.json({ message: 'Travel request deleted successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting travel request.', error: error.message });
  }
});

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

app.post('/api/requests/:id/remove-companion', async (req, res) => {
  try {
    const requestId = req.params.id;
    const { targetUserId, targetName, hostUserId } = req.body;

    const reqItem = await Request.findById(requestId);
    if (!reqItem) {
      return res.status(404).json({ message: 'Travel request not found.' });
    }

    if (hostUserId && reqItem.userId && reqItem.userId !== hostUserId) {
      return res.status(403).json({ message: 'Only the host can remove companions from this trip.' });
    }

    const initialCount = reqItem.joinedUsers.length;
    reqItem.joinedUsers = reqItem.joinedUsers.filter(u => {
      if (targetUserId && u.userId) {
        return u.userId !== targetUserId;
      }
      return u.name !== targetName;
    });

    if (reqItem.joinedUsers.length < initialCount) {
      reqItem.spots = Math.min(10, reqItem.spots + (initialCount - reqItem.joinedUsers.length));
      await reqItem.save();
    }

    res.json({
      message: 'Companion removed successfully!',
      request: reqItem
    });
  } catch (error) {
    res.status(500).json({ message: 'Error removing companion.', error: error.message });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API Endpoint Not Found' });
  }

  if (path.extname(req.path)) {
    return res.status(404).send('File not found');
  }

  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 SathChalo Server running on http://localhost:${PORT}`);
});
