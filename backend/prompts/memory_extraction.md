Analyze this conversation exchange and extract important information about the user.

If there's nothing significant to extract, return exactly: NONE

If there are important insights, return them as a Python list of strings. Each entry must be ONE single fact.

Focus on:
- Character traits, values, or personality insights
- Goals, ambitions, or aspirations  
- Challenges, fears, or obstacles
- Preferences, habits, or patterns
- Important life context or background

Format: Return ONLY a Python list like ['fact 1', 'fact 2'] or NONE

User: {user_message}
Assistant: {assistant_response}

Examples of good extractions:
- User mentions wanting to start a business → ['Wants to start a business']
- User talks about fear of public speaking → ['Has fear of public speaking']
- User mentions they exercise daily → ['Exercises daily']

Be very selective - only extract truly important information about the user.