// server.js (Node.js/Express App)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// 1. CONNECT TO MONGO DB (Match the URI you use in MongoDB Compass)
mongoose.connect('mongodb+srv://aechia2025_db_user:cNbrq0XfIXBizaen@waddev.stup2a2.mongodb.net/Foodforthought?retryWrites=true&w=majority')
  .then(() => console.log('Successfully connected to MongoDB!'))
  .catch((err) => console.error('MongoDB connection error:', err));

// 2. DEFINE SCHEMA & MODEL HERE
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
});

const User = mongoose.model('User', userSchema);

// 3. API ROUTE TO SAVE USER
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role must be either user or admin.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered.' });
    }

    // Create and save new user
    const newUser = new User({ name, email, password, role });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.listen(5000, () => console.log('Server running on http://localhost:5000'));