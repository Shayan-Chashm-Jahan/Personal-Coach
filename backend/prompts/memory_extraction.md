Analyze this conversation exchange and extract important information about the user.

{conversation_context}

{existing_memories}

If there's nothing significant to extract, return exactly: NONE

If there are important insights, return them as a Python list of strings. Each entry must be ONE single fact.

From the previous messages, we have already extracted data. Also, from the coach's messages, we will extract information if and only if the coach has extracted it from valid resources, for example by searching. We mainly extract things from what the user says. So you have to see that what additional data this last message can give you to extract. Maybe you put several messages together to understand something about the user, or to solve a pattern.

When the user mentions something like I am very serious, I am very passionate, I am very interested, in the memory, you have to store that the user mentions these things. We don't store that the user really is that. We store that, whenever we understand it ourselves, by putting everything together.

Focus on:

- Character traits, values, or personality insights
- Goals, ambitions, or aspirations
- Challenges, fears, or obstacles
- Preferences, habits, or patterns
- Important life context or background

Format: Return ONLY a Python list like ['fact 1', 'fact 2'] or NONE

SPECIAL INFORMATION: When you identify the following, use these exact prefixes:

- If user provides their first name: ['FIRST_NAME: John']
- If user provides their last name: ['LAST_NAME: Smith']
- If user provides their full name: ['FIRST_NAME: John', 'LAST_NAME: Smith']
- If user provides their birthdate: ['BIRTH_DATE: 1990-03-15'] (always convert to YYYY-MM-DD format)

User: {user_message}
Assistant: {assistant_response}

Examples of good extractions:

- User says "I'm John Smith" → ['FIRST_NAME: John', 'LAST_NAME: Smith']
- User says "My name is Sarah" → ['FIRST_NAME: Sarah']
- User says "I was born on March 15, 1990" → ['BIRTH_DATE: 1990-03-15']
- User mentions wanting to start a business → ['User mentioned wants to start a business']
- User talks about fear of public speaking → ['User mentioned having fears of public speaking']
- User mentions they exercise daily → ['User mentions exercises daily']

Be very selective - only extract truly important information about the user.
