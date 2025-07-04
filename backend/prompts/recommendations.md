Based on the following initial coaching conversation and the user's previous material feedback, recommend exactly 4 books and 4 YouTube videos that would be most beneficial for this person's growth and goals.

Conversation:
{conversation_text}

User's Previous Material Feedback:
{user_feedback}

Use Google Search to find real, current, and highly-rated content. For YouTube videos, search for the exact video title and channel, then extract the actual YouTube URL from the search results. Ensure all recommendations are:
- Directly relevant to the person's goals, challenges, and interests mentioned
- From reputable sources and well-reviewed
- Practical and actionable for personal growth
- Current and accessible
- For videos: Only include URLs that you find in actual Google Search results - do not generate or guess YouTube video IDs

Provide your response in the following JSON format:
{{
    "books": [
        {{"title": "Book Title", "author": "Author Name", "description": "Brief description of why this book is relevant"}},
        {{"title": "Book Title", "author": "Author Name", "description": "Brief description of why this book is relevant"}},
        {{"title": "Book Title", "author": "Author Name", "description": "Brief description of why this book is relevant"}},
        {{"title": "Book Title", "author": "Author Name", "description": "Brief description of why this book is relevant"}}
    ],
    "videos": [
        {{"title": "Exact Video Title", "channel": "Channel Name", "description": "Brief description of why this video is relevant"}},
        {{"title": "Exact Video Title", "channel": "Channel Name", "description": "Brief description of why this video is relevant"}},
        {{"title": "Exact Video Title", "channel": "Channel Name", "description": "Brief description of why this video is relevant"}},
        {{"title": "Exact Video Title", "channel": "Channel Name", "description": "Brief description of why this video is relevant"}}
    ]
}}

Requirements:
- Books must be real, published books that exist and can be found online
- For videos: provide the EXACT video title and channel name as they appear on YouTube
- Use Google Search to find real, existing YouTube videos - do not make up video titles
- Focus on content that directly addresses the specific goals and challenges mentioned in the conversation
- Prioritize recent, popular, and well-reviewed content
- Ensure video titles and channel names are accurate and searchable

IMPORTANT Feedback Considerations:
- Pay close attention to the user's previous feedback ratings and reviews
- Recommend MORE content similar to materials they rated 4-5 stars
- AVOID recommending content similar to materials they rated 1-2 stars
- Consider their review comments to understand what they liked or disliked
- If they mentioned specific preferences (e.g., "too theoretical", "love practical examples", "prefer shorter videos"), incorporate these into your recommendations
- If no feedback is available, make recommendations based solely on the conversation