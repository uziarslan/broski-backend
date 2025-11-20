const TV = require('../models/TV');
const cloudinary = require('../cloudinary');
const wrapAsync = require('../utils/wrapAsync');
const ExpressError = require('../utils/ExpressError');

// Get all videos
const getAllVideos = wrapAsync(async (req, res) => {
    const { page = 1, limit = 10, category, search, isActive = true } = req.query;

    const query = { isActive };

    if (category) {
        query.category = category;
    }

    if (search) {
        query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { tags: { $in: [new RegExp(search, 'i')] } }
        ];
    }

    const videos = await TV.find(query)
        .populate('uploadedBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

    const total = await TV.countDocuments(query);

    res.json({
        success: true,
        data: videos,
        pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total
        }
    });
});

// Get single video
const getVideo = wrapAsync(async (req, res) => {
    const { id } = req.params;

    const video = await TV.findById(id).populate('uploadedBy', 'name email');
    if (!video) {
        throw new ExpressError('Video not found', 404);
    }

    res.json({
        success: true,
        data: video
    });
});

// Add video URL
const addVideo = wrapAsync(async (req, res) => {
    const { title, description, category, tags, videoUrl, platform } = req.body;
    const uploadedBy = req.user.userId; // From JWT token

    if (!videoUrl || !platform) {
        throw new ExpressError('Video URL and platform are required', 400);
    }

    // Validate platform
    const validPlatforms = ['youtube', 'tiktok', 'instagram', 'vimeo'];
    if (!validPlatforms.includes(platform)) {
        throw new ExpressError('Invalid platform. Supported platforms: youtube, tiktok, instagram, vimeo', 400);
    }

    try {
        // Extract video ID based on platform
        let videoId = '';
        let thumbnail = '';

        switch (platform) {
            case 'youtube':
                videoId = extractYouTubeVideoId(videoUrl);
                break;
            case 'tiktok':
                videoId = extractTikTokVideoId(videoUrl);
                break;
            case 'instagram':
                videoId = extractInstagramVideoId(videoUrl);
                break;
            case 'vimeo':
                videoId = extractVimeoVideoId(videoUrl);
                break;
        }

        // Check if a custom thumbnail was uploaded (for Instagram)
        if (req.file && platform === 'instagram') {
            // Use the uploaded thumbnail from Cloudinary
            thumbnail = req.file.path;
        } else {
            // Generate thumbnail URL using helper function
            thumbnail = generateThumbnailUrl(platform, videoId, videoUrl);

            // For TikTok, try to fetch thumbnail from oEmbed API
            if (platform === 'tiktok' && !thumbnail) {
                try {
                    thumbnail = await fetchThumbnailFromOEmbed(platform, videoUrl);
                } catch (error) {
                    thumbnail = '';
                }
            }

            // For Instagram, try to generate thumbnail using alternative methods (only if no custom thumbnail)
            if (platform === 'instagram' && !thumbnail) {
                try {
                    // Try oEmbed API first
                    thumbnail = await fetchThumbnailFromOEmbed(platform, videoUrl);

                    // If oEmbed fails, try the dedicated Instagram function
                    if (!thumbnail) {
                        thumbnail = await generateInstagramThumbnail(videoUrl);
                    }
                } catch (error) {
                    thumbnail = '';
                }
            }
        }

        if (!videoId) {
            throw new ExpressError('Invalid video URL for the specified platform', 400);
        }

        // Create video record
        const video = new TV({
            title,
            description,
            videoUrl,
            platform,
            videoId,
            thumbnail,
            duration: 0, // Will be updated later if needed
            uploadedBy,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            category: category || 'other'
        });

        await video.save();


        res.status(201).json({
            success: true,
            message: 'Video added successfully',
            data: video
        });

    } catch (error) {
        throw error;
    }
});

// Helper functions to extract video IDs from URLs
function extractYouTubeVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : '';
}

function extractTikTokVideoId(url) {
    const regExp = /^.*(tiktok\.com\/@[\w.-]+\/video\/|tiktok\.com\/v\/)(\d+).*/;
    const match = url.match(regExp);
    return match ? match[2] : '';
}

function extractInstagramVideoId(url) {
    const regExp = /^.*(instagram\.com\/p\/|instagram\.com\/reel\/)([^\/\?]+).*/;
    const match = url.match(regExp);
    return match ? match[2] : '';
}

function extractVimeoVideoId(url) {
    const regExp = /^.*(vimeo\.com\/)(\d+).*/;
    const match = url.match(regExp);
    return match ? match[2] : '';
}

// Helper function to generate thumbnail URL for any platform
function generateThumbnailUrl(platform, videoId, videoUrl) {
    switch (platform) {
        case 'youtube':
            return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        case 'tiktok':
            // TikTok doesn't provide direct thumbnail URLs
            // We'll use a placeholder or try to extract from TikTok's oEmbed
            // For now, return empty string to use fallback icon
            return '';
        case 'instagram':
            // Instagram doesn't provide direct thumbnail URLs without API access
            // We'll use a placeholder or try to extract from Instagram's oEmbed
            // For now, return empty string to use fallback icon
            return '';
        case 'vimeo':
            return `https://vumbnail.com/${videoId}.jpg`;
        default:
            return '';
    }
}

// Helper function to fetch thumbnail from oEmbed APIs
async function fetchThumbnailFromOEmbed(platform, videoUrl) {
    try {
        let oEmbedUrl = '';

        switch (platform) {
            case 'tiktok':
                oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
                break;
            case 'instagram':
                oEmbedUrl = `https://www.instagram.com/oembed/?url=${encodeURIComponent(videoUrl)}`;
                break;
            default:
                return '';
        }

        const response = await fetch(oEmbedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            return '';
        }

        const data = await response.json();

        // Extract thumbnail URL from oEmbed response
        if (data.thumbnail_url) {
            return data.thumbnail_url;
        }

        return '';
    } catch (error) {
        return '';
    }
}

// Helper function to generate Instagram thumbnail using oEmbed API
async function generateInstagramThumbnail(videoUrl) {
    try {
        // Use Instagram's oEmbed API
        const oEmbedUrl = `https://www.instagram.com/oembed/?url=${encodeURIComponent(videoUrl)}`;

        const response = await fetch(oEmbedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            return '';
        }

        const data = await response.json();

        // Extract thumbnail URL from oEmbed response
        if (data.thumbnail_url) {
            return data.thumbnail_url;
        }

        return '';
    } catch (error) {
        return '';
    }
}

// Update video
const updateVideo = wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { title, description, category, tags, isActive } = req.body;

    const video = await TV.findById(id);
    if (!video) {
        throw new ExpressError('Video not found', 404);
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category) updateData.category = category;

    // Handle tags processing safely
    if (tags !== undefined) {
        if (typeof tags === 'string' && tags.trim()) {
            updateData.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
        } else if (Array.isArray(tags)) {
            updateData.tags = tags.filter(tag => tag && tag.trim());
        } else {
            updateData.tags = [];
        }
    }

    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedVideo = await TV.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
    ).populate('uploadedBy', 'name email');

    res.json({
        success: true,
        message: 'Video updated successfully',
        data: updatedVideo
    });
});

// Delete video
const deleteVideo = wrapAsync(async (req, res) => {
    const { id } = req.params;

    const video = await TV.findById(id);
    if (!video) {
        throw new ExpressError('Video not found', 404);
    }

    try {
        // Delete from Cloudinary if cloudinaryPublicId exists
        if (video.cloudinaryPublicId) {
            try {
                await cloudinary.uploader.destroy(video.cloudinaryPublicId, {
                    resource_type: 'video'
                });
            } catch (cloudinaryError) {
                // Continue with database deletion even if Cloudinary fails
            }
        } else {
        }

        // Delete from database
        await TV.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Video deleted successfully'
        });

    } catch (error) {
        throw new ExpressError('Failed to delete video', 500);
    }
});

// Increment video views
const incrementViews = wrapAsync(async (req, res) => {
    const { id } = req.params;

    const video = await TV.findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true }
    );

    if (!video) {
        throw new ExpressError('Video not found', 404);
    }

    res.json({
        success: true,
        data: { views: video.views }
    });
});

// Toggle video like
const toggleLike = wrapAsync(async (req, res) => {
    const { id } = req.params;

    const video = await TV.findById(id);
    if (!video) {
        throw new ExpressError('Video not found', 404);
    }

    // For now, just increment likes (you can implement user-specific likes later)
    video.likes += 1;
    await video.save();

    res.json({
        success: true,
        data: { likes: video.likes }
    });
});

// Get video statistics
const getVideoStats = wrapAsync(async (req, res) => {
    const stats = await TV.aggregate([
        {
            $group: {
                _id: null,
                totalVideos: { $sum: 1 },
                totalViews: { $sum: '$views' },
                totalLikes: { $sum: '$likes' },
                totalSize: { $sum: '$size' },
                avgDuration: { $avg: '$duration' }
            }
        }
    ]);

    const categoryStats = await TV.aggregate([
        {
            $group: {
                _id: '$category',
                count: { $sum: 1 },
                totalViews: { $sum: '$views' }
            }
        }
    ]);

    res.json({
        success: true,
        data: {
            overall: stats[0] || {
                totalVideos: 0,
                totalViews: 0,
                totalLikes: 0,
                totalSize: 0,
                avgDuration: 0
            },
            byCategory: categoryStats
        }
    });
});

// Update thumbnails for videos that don't have them
const updateMissingThumbnails = wrapAsync(async (req, res) => {
    try {
        const videosWithoutThumbnails = await TV.find({
            $or: [
                { thumbnail: { $exists: false } },
                { thumbnail: '' },
                { thumbnail: null }
            ]
        });

        let updatedCount = 0;

        for (const video of videosWithoutThumbnails) {
            let thumbnailUrl = generateThumbnailUrl(video.platform, video.videoId, video.videoUrl);

            // For TikTok, try to fetch thumbnail from oEmbed API
            if (video.platform === 'tiktok' && !thumbnailUrl) {
                try {
                    thumbnailUrl = await fetchThumbnailFromOEmbed(video.platform, video.videoUrl);
                } catch (error) {
                }
            }

            // For Instagram, try to generate thumbnail using alternative methods
            if (video.platform === 'instagram' && !thumbnailUrl) {
                try {
                    // Try oEmbed API first
                    thumbnailUrl = await fetchThumbnailFromOEmbed(video.platform, video.videoUrl);

                    // If oEmbed fails, try the dedicated Instagram function
                    if (!thumbnailUrl) {
                        thumbnailUrl = await generateInstagramThumbnail(video.videoUrl);
                    }
                } catch (error) {
                }
            }

            if (thumbnailUrl) {
                await TV.findByIdAndUpdate(video._id, { thumbnail: thumbnailUrl });
                updatedCount++;
            }
        }

        res.json({
            success: true,
            message: `Updated thumbnails for ${updatedCount} videos`,
            updatedCount
        });
    } catch (error) {
        throw error;
    }
});

// Test Instagram thumbnail generation (for debugging)
const testInstagramThumbnail = wrapAsync(async (req, res) => {
    try {
        const { videoUrl } = req.body;

        if (!videoUrl) {
            throw new ExpressError('Video URL is required', 400);
        }

        // Test both methods
        const oEmbedResult = await fetchThumbnailFromOEmbed('instagram', videoUrl);
        const directResult = await generateInstagramThumbnail(videoUrl);

        res.json({
            success: true,
            videoUrl,
            oEmbedResult,
            directResult,
            working: !!(oEmbedResult || directResult)
        });
    } catch (error) {
        throw error;
    }
});

module.exports = {
    getAllVideos,
    getVideo,
    addVideo,
    updateVideo,
    deleteVideo,
    incrementViews,
    toggleLike,
    getVideoStats,
    updateMissingThumbnails,
    testInstagramThumbnail
};
