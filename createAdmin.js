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
        createAdmin();
    })
    .catch((error) => {
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

    } catch (error) {
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
}
