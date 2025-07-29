const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 8001;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vu4gdkc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// const verifyToken = (req, res, next) => {
//   const token = req.headers.authorization?.split(' ')[1];
//   if (!token) {
//     return res.status(401).send({ message: 'Unauthorized access' });
//   }

//   jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//     if (err) {
//       return res.status(401).send({ message: 'Unauthorized access: Invalid or expired token' });
//     }
//     req.decoded = decoded;
//     next();
//   });
// };
// Middlewares
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: 'Unauthorized access: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'Forbidden: Invalid or expired token' });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    const db = client.db('BloodDonationDB');
    const userCollection = db.collection('users');
    const donationRequestCollection = db.collection('donation-requests');
    const blogCollection = db.collection('blogs');
    const paymentCollection = db.collection("payments");
 app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' }); // Short-lived token
      res.send({ token });
    });
// app.post('/jwt', async (req, res) => {
//   const user = req.body;
//   if (!user || !user.email) {
//     return res.status(400).send({ message: "Missing user data" });
//   }

//   const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
//   res.send({ token });
// });


app.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;         // Current page, default 1
    const limit = parseInt(req.query.limit) || 5;       // Items per page, default 5
    const statusFilter = req.query.status || '';        // Status filter: 'active', 'blocked', or ''

    const query = {};
    if (statusFilter) {
      query.status = statusFilter;
    }

    // Count total users matching the filter
    const totalUsers = await userCollection.countDocuments(query);

    // Calculate total pages
    const totalPages = Math.ceil(totalUsers / limit);

    // Fetch users for the current page with filtering and limit
    const users = await userCollection.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .project({ password: 0, confirmPassword: 0 }) // exclude sensitive fields
      .toArray();

    console.log("Fetched users:", users.length);

  res.json({
  users,
  totalUsers,
  totalPages,
  currentPage: page,
});
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error fetching users' });
  }
});


    // Protected route example
    app.get('/users/:email', verifyToken, async (req, res) => {
  const email = req.params.email;

  // Check if the token's email matches the requested email
  if (req.decoded.email !== email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  try {
    const user = await userCollection.findOne(
      { email },
      { projection: { password: 0, confirmPassword: 0 } }
    );
    if (user) {
      res.send(user);
    } else {
      res.status(404).send({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).send({ message: 'Internal server error' });
  }
});
   app.post('/users', async (req, res) => {
      const user = req.body;
      // Insert email if user doesn't exist
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
      // Set default status to "active"
      user.status = "active";
      user.role = "donor"; // Default role
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

//     app.post('/users', async (req, res) => {
//   const user = req.body;

//   if (!user || !user.email || !user.password) {
//     return res.status(400).send({ message: "Incomplete user data" });
//   }

//   const existingUser = await userCollection.findOne({ email: user.email });
//   if (existingUser) {
//     return res.send({ message: 'User already exists', insertedId: null });
//   }

//   user.status = "active";
//   user.role = "donor"; // default
//   const result = await userCollection.insertOne(user);
//   res.send(result);
// });
    // Update user status
    app.patch('/users/:id/status', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const update = { $set: { status: status } };
      const result = await userCollection.updateOne(query, update);
      res.send(result);
    });
    //add user role
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      if (user) {
        res.send({ role: user.role });
      } else {
        res.send({ role: null });
      }
    });


    // Update user role
    app.patch('/users/:id/role', async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const query = { _id: new ObjectId(id) };
      const update = { $set: { role: role } };
      const result = await userCollection.updateOne(query, update);
      res.send(result);
    });

    // Update user information
    app.patch('/users/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid user ID' });
      }
      const updatedUser = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updatedUser.name,
          avatar: updatedUser.avatar,
          district: updatedUser.district,
          upazila: updatedUser.upazila,
          bloodGroup: updatedUser.bloodGroup
        }
      };
      const result = await userCollection.updateOne(query, update);
      res.send(result);
    });

    // Donation request API
    app.post('/donation-requests', async (req, res) => {
      const donationRequest = req.body;
      const userQuery = { email: donationRequest.requesterEmail };
      const user = await userCollection.findOne(userQuery);

      console.log('User:', user); // Add this line to debug the user object

      if (!user || user.status !== 'active') {
        return res.status(403).send({ message: 'Blocked users cannot create donation requests.' });
      }
      const result = await donationRequestCollection.insertOne(donationRequest);
      res.send(result);
    });


    //Get all donation request
    app.get('/donation-requests', async (req, res) => {
      try {
        const { bloodGroup, status, page = 1, limit = 10 } = req.query;
        const query = {};

        if (bloodGroup) {
          query.bloodGroup = bloodGroup; // Filter by blood group
        }

        if (status) {
          query.status = status; // Optionally filter by status
        }

        const options = {
          skip: (parseInt(page) - 1) * parseInt(limit),
          limit: parseInt(limit),
        };

        const donationRequests = await donationRequestCollection.find(query, options).toArray();
        const total = await donationRequestCollection.countDocuments(query);
        res.send({ donationRequests, total });
      } catch (error) {
        console.error('Error fetching donation requests:', error);
        res.status(500).send({ error: 'An error occurred while fetching donation requests' });
      }
    });

    app.patch('/donation-requests/:id', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      try {
        const result = await donationRequestCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.modifiedCount === 1) {
          res.send({ message: 'Donation request status updated successfully' });
        } else {
          res.status(404).send({ error: 'Donation request not found' });
        }
      } catch (error) {
        console.error('Error updating donation request status:', error);
        res.status(500).send({ error: 'An error occurred while updating donation request status' });
      }
    });




    // Get donation requests by requester email
    app.get('/donation-requests/:email', async (req, res) => {
      try {
        const { email } = req.params;
        const { status, page = 1, limit = 10 } = req.query;

        const query = { requesterEmail: email }; // Match the `requesterEmail` field in your MongoDB
        if (status) {
          query.status = status; // Optionally filter by status
        }

        const options = {
          skip: (parseInt(page) - 1) * parseInt(limit),
          limit: parseInt(limit),
        };
        const donationRequests = await donationRequestCollection.find(query, options).toArray();
        const total = await donationRequestCollection.countDocuments(query);
        res.send({ donationRequests, total });
      } catch (error) {
        console.error("Error fetching donation requests:", error);
        res.status(500).send({ error: "An error occurred while fetching donation requests" });
      }
    });






    // Update donation request status
    app.patch('/donation-requests/:id/status', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const update = { $set: { status: status } };
      const result = await donationRequestCollection.updateOne(query, update);
      res.send(result);
    });
    //delete request
    app.delete('/donation-requests/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationRequestCollection.deleteOne(query);
      res.send(result);
    });


    // Verify admin or volunteer middleware
    const verifyAdminOrVolunteer = async (req, res, next) => {
      const email = req.decoded?.email;
      if (!email) return res.status(401).send({ message: 'Unauthorized access' });

      const user = await userCollection.findOne({ email });
      if (!user || (user.role !== 'admin' && user.role !== 'volunteer')) {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      next();
    };
    //Blog related apis
    app.post('/blogs', async (req, res) => {
      const { title, thumbnail, content, createdBy } = req.body;

      try {
        const blog = {
          title,
          thumbnail,
          content,
          status: 'draft', // Default status
          createdBy,
          createdAt: new Date(),
        };

        const result = await blogCollection.insertOne(blog);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error creating blog' });
      }
    });

    app.get('/blogs', async (req, res) => {
      const { status, page = 1, limit = 10 } = req.query;

      try {
        const query = {};
        if (status) query.status = status;

        const options = {
          skip: (parseInt(page) - 1) * parseInt(limit),
          limit: parseInt(limit),
        };

        const blogs = await blogCollection.find(query, options).toArray();
        const total = await blogCollection.countDocuments(query);
        res.send({ blogs, total });
      } catch (error) {
        res.status(500).send({ message: 'Error fetching blogs' });
      }
    });

    app.patch('/blogs/:id/status', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      try {
        const result = await blogCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error updating blog status' });
      }
    });

    app.delete('/blogs/:id', async (req, res) => {
      const id = req.params.id;

      try {
        const result = await blogCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error deleting blog' });
      }
    });

    //payments related apis
   app.post('/create-payment-intent', async (req, res) => {
  const { amount } = req.body;

  console.log("Received amount:", amount); // ← for debugging

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).send({ message: "Invalid amount" });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card'],
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Error creating payment intent:", err.message);
    res.status(500).send({ message: "Failed to create payment intent" });
  }
});
    
    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" })
      }
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/payments', async (req, res) => { 
      const { email, price, transactionId, date, status } = req.body; 
      if (!email || !price || !transactionId || !date || !status) { 
        return res.status(400).send({ message: "Missing required fields in payment data" }); 
      } 
      try { 
        const paymentData = {
          ...req.body,
          price: parseInt(price, 10) // Convert price to integer
        };
        const paymentResult = await paymentCollection.insertOne(paymentData); 
        res.send({ paymentResult }); 
      } catch (err) { 
        console.error("Database Error:", err.message); 
        res.status(500).send({ message: "Failed to save payment" }); 
      } 
    });
    

    // Example: Admin-only route
    app.get('/admin-data', verifyToken, verifyAdminOrVolunteer, async (req, res) => {
      res.send({ message: 'Welcome, admin or volunteer!' });
    });

    //Admin-home api
    app.get('/admin-state', async(req, res)=>{
      const users = await userCollection.estimatedDocumentCount()
      const donationRequest = await donationRequestCollection.estimatedDocumentCount()
      
      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id : null,
            totalRevenue: {
              $sum : '$price'
            }
          }
        },
      ]).toArray()


      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({
        users,
        donationRequest,
        revenue
      })
    })

    console.log('Server connected to MongoDB!');
  } finally {
    // Do not close the client in production to keep the connection alive
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Blood Donation server is running');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);})
