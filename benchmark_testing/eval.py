import anthropic
from dotenv import load_dotenv
import os
import pandas as pd
from tqdm import tqdm

load_dotenv()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

df = pd.read_csv("opus_consensus_results.csv", encoding="latin-1")
scores = []

for i, row in enumerate(tqdm(df.itertuples(), total=len(df))):
    try:
        eval_prompt = f"""
You are an expert in diagnosing challenging cases. You will receive a student's answer containing their top single diagnosis, as well as the reference diagnosis. You need to score each diagnosis from the student's answer according to the following rules:
2 = The student's diagnosis exactly matches the reference diagnosis;
1 = The student's diagnosis is a broad category that includes the reference diagnosis;
0 = The student's diagnosis does not meet the criteria for a score of 1 or 2.
Here is the student's answer:
{row.predicted}
Here is the reference diagnosis:
{row.correct}
Just provide the score as a single number (0, 1, or 2), nothing else.
"""
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=10,
            messages=[{"role": "user", "content": eval_prompt}]
        )
        score = int(response.content[0].text.strip())
    except Exception as e:
        print(f"Row {i} failed: {e}")
        score = None

    scores.append(score)

    if i % 10 == 0:
        df["score"] = pd.array(scores + [None] * (len(df) - len(scores)))
        df.to_csv("opus_consensus_results.csv", index=False)

df["score"] = scores
df.to_csv("opus_consensus_results.csv", index=False, encoding="latin-1")
print(df.head())
print(f"\nMean score: {df['score'].mean():.3f}")
