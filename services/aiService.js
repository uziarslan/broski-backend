const OpenAI = require('openai');
const config = require('../config');

// Initialize OpenAI client with proper error handling
let openai;
try {
    if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'your_openai_api_key_here') {
        throw new Error('OpenAI API key is not configured');
    }
    openai = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
    });
} catch (error) {
    openai = null;
}

/**
 * Get a response from ChatGPT Assistant with image analysis
 * @param {string} assistantId - The ChatGPT assistant ID
 * @param {string} message - The message to send to the assistant
 * @param {string} imageUrl - The URL of the image to analyze
 * @param {Object} options - The options for the request
 * @returns {Object} The response from the assistant
 */
const getChatGPTAssistantImageResponse = async (assistantId, message, imageUrl, options = {}) => {
    try {
        // Check if OpenAI client is initialized
        if (!openai) {
            throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
        }

        // Create a thread
        const thread = await openai.beta.threads.create();

        // Add message with image to thread
        await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: [
                {
                    type: "text",
                    text: message
                },
                {
                    type: "image_url",
                    image_url: {
                        url: imageUrl
                    }
                }
            ]
        });

        // Run the assistant
        const run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: assistantId,
            ...options
        });

        // Wait for completion
        let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        while (runStatus.status !== 'completed') {
            if (runStatus.status === 'failed') {
                throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        }

        // Get the messages
        const messages = await openai.beta.threads.messages.list(thread.id);
        const assistantMessage = messages.data.find(msg => msg.role === 'assistant');

        if (!assistantMessage) {
            throw new Error('No response from assistant');
        }

        // Extract content from the message
        const content = assistantMessage.content[0];
        let responseText = '';

        if (content.type === 'text') {
            responseText = content.text.value;
        } else {
            throw new Error('Unexpected response type from assistant');
        }

        return {
            content: responseText,
            threadId: thread.id,
            runId: run.id,
            usage: {
                // Note: Assistant API doesn't provide token usage in the same way
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            },
        };
    } catch (error) {

        // Provide more helpful error messages
        if (error.message.includes('API key') || error.message.includes('not configured')) {
            throw new Error('OpenAI API key is invalid or not configured. Please check your .env file.');
        } else if (error.status === 401) {
            throw new Error('OpenAI API key is invalid. Please check your .env file.');
        } else if (error.status === 429) {
            throw new Error('OpenAI API rate limit exceeded. Please try again later.');
        } else {
            throw new Error(`ChatGPT Assistant Image API error: ${error.message}`);
        }
    }
};

/**
 * Get a response from ChatGPT Assistant
 * @param {string} assistantId - The ChatGPT assistant ID
 * @param {string} message - The message to send to the assistant (optional)
 * @param {Object} options - The options for the request
 * @returns {Object} The response from the assistant
 */
const getChatGPTAssistantResponse = async (assistantId, message = "", options = {}) => {
    try {
        // Check if OpenAI client is initialized
        if (!openai) {
            throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
        }

        // Create a thread
        const thread = await openai.beta.threads.create();

        // Add message to thread
        await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: message
        });

        // Run the assistant
        const run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: assistantId,
            ...options
        });

        // Wait for completion
        let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        while (runStatus.status !== 'completed') {
            if (runStatus.status === 'failed') {
                throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        }

        // Get the messages
        const messages = await openai.beta.threads.messages.list(thread.id);
        const assistantMessage = messages.data.find(msg => msg.role === 'assistant');

        if (!assistantMessage) {
            throw new Error('No response from assistant');
        }

        // Extract content from the message
        const content = assistantMessage.content[0];
        let responseText = '';

        if (content.type === 'text') {
            responseText = content.text.value;
        } else {
            throw new Error('Unexpected response type from assistant');
        }

        return {
            content: responseText,
            threadId: thread.id,
            runId: run.id,
            usage: {
                // Note: Assistant API doesn't provide token usage in the same way
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            },
        };
    } catch (error) {

        // Provide more helpful error messages
        if (error.message.includes('API key') || error.message.includes('not configured')) {
            throw new Error('OpenAI API key is invalid or not configured. Please check your .env file.');
        } else if (error.status === 401) {
            throw new Error('OpenAI API key is invalid. Please check your .env file.');
        } else if (error.status === 429) {
            throw new Error('OpenAI API rate limit exceeded. Please try again later.');
        } else {
            throw new Error(`ChatGPT Assistant API error: ${error.message}`);
        }
    }
};

module.exports = {
    getChatGPTAssistantResponse,
    getChatGPTAssistantImageResponse
};
