const { getChatGPTAssistantResponse, getChatGPTAssistantImageResponse } = require('../services/aiService');
const config = require('../config');
const { cloudinary } = require('../cloudinary');

// ============ CHAT COACH MODE ============
const generateChatReplies = async (req, res) => {
    const { userMessage, contextMessages, tone } = req.body;

    if (!userMessage) {
        return res.status(400).json({ error: 'User message is required' });
    }

    if (!tone) {
        return res.status(400).json({ error: 'Tone is required' });
    }

    try {
        // Get the assistant ID from environment variables
        const assistantId = config.CHATGPT_CHAT_REPLIES;

        if (!assistantId) {
            throw new Error('ChatGPT Assistant ID is not configured. Please set CHATGPT_CHAT_REPLIES in your .env file.');
        }

        // Create tone-specific instructions
        const toneInstructions = {
            flirty: "Analyze this conversation screenshot and give flirty, playful, charming replies",
            chill: "Analyze this conversation screenshot and give relaxed, easy-going replies",
            funny: "Analyze this conversation screenshot and give witty, humorous replies",
            confident: "Analyze this conversation screenshot and give bold, charismatic replies",
            sarcastic: "Analyze this conversation screenshot and give teasing, clever replies",
            savage: "Analyze this conversation screenshot and give fearless, unapologetic replies",
            apologetic: "Analyze this conversation screenshot and give sincere, understanding replies",
            supportive: "Analyze this conversation screenshot and give caring, encouraging replies"
        };

        // Create the message for the assistant
        const message = `${toneInstructions[tone] || toneInstructions.flirty}. They got this message: "${userMessage}"${contextMessages ? `\nContext: ${contextMessages}` : ""}`;

        // Use ChatGPT Assistant to generate chat replies
        const response = await getChatGPTAssistantResponse(assistantId, message);

        // Extract JSON from the response content
        const content = response.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            res.json({ success: true, data: parsed });
        } else {
            // Fallback if no JSON found
            res.json({ success: true, data: { smooth: "I like where this is going... what else?", funny: "Hey, that's interesting! Tell me more 😄", real: "That's cool. What made you think of that?", tip: "Keep it natural bro, you got this 💪" } });
        }
    } catch (error) {
        console.error("Error generating chat replies:", error);
        res.json({ success: true, data: { smooth: "I like where this is going... what else?", funny: "Hey, that's interesting! Tell me more 😄", real: "That's cool. What made you think of that?", tip: "Keep it natural bro, you got this 💪" } });
    }
};

// ============ DAILY RIZZ DRILLS ============
const generateDailyRizzDrill = async (req, res) => {
    try {
        // Get the assistant ID from environment variables
        const assistantId = config.CHATGPT_DAILYRIZZ_DRILL;

        if (!assistantId) {
            throw new Error('ChatGPT Assistant ID is not configured. Please set CHATGPT_DAILYRIZZ_DRILL in your .env file.');
        }

        // Use ChatGPT Assistant to generate the daily rizz drill
        const response = await getChatGPTAssistantResponse(assistantId, "Generate a daily rizz drill challenge");

        // Extract JSON from the response content
        const content = response.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            res.json({ success: true, data: parsed });
        } else {
            // Fallback if no JSON found
            res.json({ success: true, data: { scenario: "You're texting your crush", challenge: "She says: 'You're so quiet 😅' - What do you reply?" } });
        }
    } catch (error) {
        console.error("Error generating drill:", error);
        res.json({ success: true, data: { scenario: "You're texting your crush", challenge: "She says: 'You're so quiet 😅' - What do you reply?" } });
    }
};

const scoreRizzDrillResponse = async (req, res) => {
    const { drill, userResponse } = req.body;

    if (!drill || !userResponse) {
        return res.status(400).json({ error: 'Drill and user response are required' });
    }

    try {
        // Get the assistant ID from environment variables
        const assistantId = config.CHATGPT_SCORE_DRILL;

        if (!assistantId) {
            throw new Error('ChatGPT Assistant ID is not configured. Please set CHATGPT_SCORE_DRILL in your .env file.');
        }

        // Create the message for the assistant
        const message = `Challenge: ${drill.challenge}\nUser's response: "${userResponse}"`;

        // Use ChatGPT Assistant to score the drill response
        const response = await getChatGPTAssistantResponse(assistantId, message);

        // Extract JSON from the response content
        const content = response.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            res.json({ success: true, data: parsed });
        } else {
            // Fallback if no JSON found
            res.json({ success: true, data: { score: 6, feedback: "Not bad! Keep practicing to improve your delivery.", suggestion: "Try being more playful and confident in your tone." } });
        }
    } catch (error) {
        console.error("Error scoring drill:", error);
        res.json({ success: true, data: { score: 6, feedback: "Not bad! Keep practicing to improve your delivery.", suggestion: "Try being more playful and confident in your tone." } });
    }
};

// ============ CONFIDENCE MODE ============
const generateConfidenceMessage = async (req, res) => {
    try {
        // Get the assistant ID from environment variables
        const assistantId = config.CHATGPT_CONFIDENCE_MESSAGE;

        if (!assistantId) {
            throw new Error('ChatGPT Assistant ID is not configured. Please set CHATGPT_CONFIDENCE_MESSAGE in your .env file.');
        }

        // Use ChatGPT Assistant to generate confidence message
        const response = await getChatGPTAssistantResponse(assistantId, "Generate a confidence message");

        // Clean the response content
        const message = response.content.replace(/^["']|["']$/g, "").trim();
        res.json({ success: true, data: { message } });
    } catch (error) {
        console.error("Error generating confidence message:", error);
        res.json({ success: true, data: { message: "You've got this, bro. She's lucky to text you." } });
    }
};


// ============ AWKWARD SITUATIONS RECOVERY ============
const generateAwkwardSituationRecovery = async (req, res) => {
    const { situation, tone } = req.body;

    if (!situation) {
        return res.status(400).json({ error: 'Situation is required' });
    }

    if (!tone) {
        return res.status(400).json({ error: 'Tone is required' });
    }

    try {
        // Get the assistant ID from environment variables
        const assistantId = config.CHATGPT_AWKWARD_SITUATIONS;

        if (!assistantId) {
            throw new Error('ChatGPT Assistant ID is not configured. Please set CHATGPT_AWKWARD_SITUATIONS in your .env file.');
        }

        // Create tone-specific instructions
        const toneInstructions = {
            flirty: "Analyze this conversation screenshot and give flirty, playful, charming replies",
            chill: "Analyze this conversation screenshot and give relaxed, easy-going replies",
            funny: "Analyze this conversation screenshot and give witty, humorous replies",
            confident: "Analyze this conversation screenshot and give bold, charismatic replies",
            sarcastic: "Analyze this conversation screenshot and give teasing, clever replies",
            savage: "Analyze this conversation screenshot and give fearless, unapologetic replies",
            apologetic: "Analyze this conversation screenshot and give sincere, understanding replies",
            supportive: "Analyze this conversation screenshot and give caring, encouraging replies"
        };

        // Create the message for the assistant
        const message = `${toneInstructions[tone] || toneInstructions.flirty}. The user is dealing with this awkward situation: "${situation}". Generate 3 recovery messages to help them bounce back.`;

        // Use ChatGPT Assistant to generate recovery messages
        const response = await getChatGPTAssistantResponse(assistantId, message);

        // Extract JSON from the response content
        const content = response.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            res.json({ success: true, data: parsed });
        } else {
            // Fallback if no JSON found
            res.json({ success: true, data: { smooth: "I think you're just playing hard to get 😏 But I'm patient", funny: "Haha fair, I'll give you that one 😅 But I promise my jokes get better", real: "Hey no worries, just wanted to check in and see what's up" } });
        }
    } catch (error) {
        console.error("Error generating awkward situation recovery:", error);
        res.json({ success: true, data: { smooth: "I think you're just playing hard to get 😏 But I'm patient", funny: "Haha fair, I'll give you that one 😅 But I promise my jokes get better", real: "Hey no worries, just wanted to check in and see what's up" } });
    }
};

// ============ SCREENSHOT ANALYSIS ============
const analyzeScreenshot = async (req, res) => {
    const { tone } = req.body;
    let cloudinaryPublicId = null;

    if (!req.file) {
        return res.status(400).json({ error: 'Image file is required' });
    }

    if (!tone) {
        return res.status(400).json({ error: 'Tone is required' });
    }

    try {
        // Get the assistant ID from environment variables
        const assistantId = config.CHATGPT_SCREENSHOT_ANALYSIS;

        if (!assistantId) {
            throw new Error('ChatGPT Assistant ID is not configured. Please set CHATGPT_SCREENSHOT_ANALYSIS in your .env file.');
        }

        // With CloudinaryStorage, the file is already uploaded and req.file contains the Cloudinary info
        const imageUrl = req.file.path; // This is the Cloudinary URL when using CloudinaryStorage
        cloudinaryPublicId = req.file.filename; // This is the public_id when using CloudinaryStorage

        // Create the message for the assistant based on tone
        const toneInstructions = {
            flirty: "Analyze this conversation screenshot and give flirty, playful, charming replies",
            chill: "Analyze this conversation screenshot and give relaxed, easy-going replies",
            funny: "Analyze this conversation screenshot and give witty, humorous replies",
            confident: "Analyze this conversation screenshot and give bold, charismatic replies",
            sarcastic: "Analyze this conversation screenshot and give teasing, clever replies",
            savage: "Analyze this conversation screenshot and give fearless, unapologetic replies",
            apologetic: "Analyze this conversation screenshot and give sincere, understanding replies",
            supportive: "Analyze this conversation screenshot and give caring, encouraging replies"
        };

        const message = `${toneInstructions[tone] || toneInstructions.flirty}. Analyze the conversation in this screenshot and provide reply suggestions.`;

        // Use ChatGPT Assistant to analyze the screenshot
        const response = await getChatGPTAssistantImageResponse(assistantId, message, imageUrl);

        // Extract JSON from the response content
        const content = response.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        let result;
        if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
        } else {
            // Fallback if no JSON found
            result = { smooth: "I like where this is going... what else?", funny: "Hey, that's interesting! Tell me more 😄", real: "That's cool. What made you think of that?", tip: "Keep it natural bro, you got this 💪" };
        }

        // Schedule cleanup of the screenshot from Cloudinary after processing
        // Using setImmediate to ensure cleanup happens after response is sent
        setImmediate(async () => {
            try {
                await cloudinary.uploader.destroy(cloudinaryPublicId);
                console.log(`Screenshot ${cloudinaryPublicId} deleted from Cloudinary`);
            } catch (cleanupError) {
                console.error(`Failed to delete screenshot ${cloudinaryPublicId}:`, cleanupError);
            }
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error("Error analyzing screenshot:", error);

        // Clean up uploaded file if analysis fails
        if (cloudinaryPublicId) {
            try {
                await cloudinary.uploader.destroy(cloudinaryPublicId);
                console.log(`Screenshot ${cloudinaryPublicId} deleted due to error`);
            } catch (cleanupError) {
                console.error(`Failed to delete screenshot ${cloudinaryPublicId}:`, cleanupError);
            }
        }

        res.json({ success: true, data: { smooth: "I like where this is going... what else?", funny: "Hey, that's interesting! Tell me more 😄", real: "That's cool. What made you think of that?", tip: "Keep it natural bro, you got this 💪" } });
    }
};

module.exports = {
    generateChatReplies,
    generateDailyRizzDrill,
    scoreRizzDrillResponse,
    generateConfidenceMessage,
    generateAwkwardSituationRecovery,
    analyzeScreenshot
};
