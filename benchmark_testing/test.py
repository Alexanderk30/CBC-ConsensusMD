import anthropic
from datasets import load_dataset
from dotenv import load_dotenv
import os
from datasets import load_from_disk
from tqdm import tqdm
import pandas as pd
#python3 -m pip install for any installations

load_dotenv()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


dataset = load_from_disk("diagnosis_arena_data")
results = []

for i, row in enumerate(tqdm(dataset)):
    try:
        prompt = f"""Case: {row["Case Information"]}
            Physical Exam: {row["Physical Examination"]}
            Diagnostic Tests: {row["Diagnostic Tests"]}
            What is the single most likely diagnosis?
            Be as specific as you possibly can.
            Reply with only the diagnosis name, nothing else.
            """

        response = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )
        predicted = response.content[0].text.strip()
    except Exception as e:
        print(f"Row {i} failed: {e}")
        predicted = None

    correct = row["Options"][row["Right Option"]]
    results.append({"predicted": predicted, "correct": correct})

    if i % 10 == 0:
        pd.DataFrame(results).to_csv("diagnosis_results.csv", index=False)

pd.DataFrame(results).to_csv("diagnosis_results.csv", index=False)
print(pd.DataFrame(results).head())
