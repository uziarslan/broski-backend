const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
});

// Configure Cloudinary Storage for Images
const imageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "Broski/Images", // Folder name in Cloudinary for images
        allowedFormats: ["jpeg", "png", "jpg"], // Allowed image formats
        public_id: (req, file) => `${Date.now()}-${file.originalname}`, // Unique public ID for each file
        transformation: [
            {
                quality: "auto:low",
            },
        ],
    },
});

// Configure Cloudinary Storage for Videos
const videoStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "Broski/Videos", // Folder name in Cloudinary for videos
        allowedFormats: ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv"], // Allowed video formats
        public_id: (req, file) => `video-${Date.now()}-${Math.round(Math.random() * 1E9)}`, // Unique public ID for each video
        resource_type: "video", // Explicitly set resource type to video
        transformation: [
            {
                quality: "auto:good",
                format: "mp4",
                codec: "h264",
                audio_codec: "aac",
            },
        ],
    },
});

// Configure Cloudinary Storage for Thumbnails (Instagram custom thumbnails)
const thumbnailStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "Broski/Thumbnails", // Folder name in Cloudinary for thumbnails
        allowedFormats: ["jpeg", "png", "jpg", "webp"], // Allowed thumbnail formats
        public_id: (req, file) => `thumb-${Date.now()}-${Math.round(Math.random() * 1E9)}`, // Unique public ID for each thumbnail
        transformation: [
            {
                quality: "auto:good",
                width: 640,
                height: 640,
                crop: "fill",
                gravity: "auto",
            },
        ],
    },
});

// Configure Cloudinary Storage for Screenshots
const screenshotStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "Broski/Screenshot", // Folder name in Cloudinary for screenshots
        allowedFormats: ["jpeg", "png", "jpg", "webp"], // Allowed screenshot formats
        public_id: (req, file) => `screenshot-${Date.now()}-${Math.round(Math.random() * 1E9)}`, // Unique public ID for each screenshot
        transformation: [
            {
                quality: "auto:low",
            },
        ],
    },
});

module.exports = {
    cloudinary,
    storage: imageStorage, // Default storage for images (backward compatibility)
    imageStorage,
    videoStorage,
    thumbnailStorage,
    screenshotStorage,
};
