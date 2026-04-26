import anthropic
from dotenv import load_dotenv
import os
load_dotenv()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

eval_prompt = """
You are an expert in diagnosing challenging cases. You will receive a student's answer containing their top single diagnosis, as well as the reference diagnosis. You need to score each diagnosis from the student's answer according to the following rules:

2 = The student’s diagnosis exactly matches the reference diagnosis;
1 = The student’s diagnosis is a broad category that includes the reference diagnosis;
0 = The student's diagnosis does not meet the criteria for a score of 1 or 2.

Here is the student’s answer:
Cutaneous ectopic meningioma

Here is the reference diagnosis:
Cutaneous meningeal heterotopia (CMH)

Jut provide the score, nothing else.
...
"""
eval_response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=10,
    messages=[{"role": "user", "content": eval_prompt}]
)
print(eval_response.content[0].text.strip())
