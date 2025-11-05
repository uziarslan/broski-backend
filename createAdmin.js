const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');
const config = require('./config');

// Connect to MongoDB
mongoose.connect(config.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => {
        console.log('Connected to MongoDB');
        createAdmin();
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    });

async function createAdmin() {
    try {
        const adminEmail = 'admin@broski.com';
        const adminPassword = 'Admin@123';
        const adminName = 'Broski Admin';

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: adminEmail });
        if (existingAdmin) {
            console.log('Admin user already exists with email:', adminEmail);
            console.log('Admin ID:', existingAdmin._id);
            process.exit(0);
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        // Create admin user
        const admin = new Admin({
            name: adminName,
            email: adminEmail,
            password: hashedPassword,
            role: 'admin',
            isActive: true
        });

        await admin.save();

        console.log('✅ Admin user created successfully!');
        console.log('📧 Email:', adminEmail);
        console.log('🔑 Password:', adminPassword);
        console.log('🆔 Admin ID:', admin._id);
        console.log('👤 Name:', adminName);
        console.log('🔐 Role:', admin.role);
        console.log('📅 Created at:', admin.createdAt);

    } catch (error) {
        console.error('❌ Error creating admin user:', error);
    } finally {
        mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}
