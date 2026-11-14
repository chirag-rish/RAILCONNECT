import csv
from pathlib import Path
from collections import Counter

BASE = Path(__file__).parent
train_file = BASE / "ir_train.csv"
dict_file = BASE / "ir_data_dictionary.csv"

print("=" * 80)
print("KAGGLE INDIAN RAILWAYS DATA INSPECTION")
print("=" * 80)

# ---------------------------------------------------------
# DATA DICTIONARY
# ---------------------------------------------------------
print("\n[1] DATA DICTIONARY")
print("-" * 80)

with open(dict_file, "r", encoding="utf-8-sig", newline="") as f:
    reader = csv.reader(f)
    rows = list(reader)

for row in rows[:10]:
    print(row)

print(f"\nDictionary rows: {len(rows)}")

# ---------------------------------------------------------
# TRAIN CSV HEADER
# ---------------------------------------------------------
print("\n[2] TRAIN DATA COLUMNS")
print("-" * 80)

with open(train_file, "r", encoding="utf-8-sig", newline="") as f:
    reader = csv.reader(f)
    header = next(reader)

print(f"Column count: {len(header)}")

for i, column in enumerate(header, 1):
    print(f"{i:3}. {column}")

# ---------------------------------------------------------
# SAMPLE DATA
# ---------------------------------------------------------
print("\n[3] SAMPLE DATA")
print("-" * 80)

with open(train_file, "r", encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)

    samples = []
    for i, row in enumerate(reader):
        samples.append(row)

        if i >= 4:
            break

for i, row in enumerate(samples, 1):
    print(f"\n--- ROW {i} ---")
    for key, value in row.items():
        print(f"{key}: {value}")

# ---------------------------------------------------------
# QUICK STREAMING STATISTICS
# ---------------------------------------------------------
print("\n[4] BASIC DATA STATISTICS")
print("-" * 80)

row_count = 0
missing_counts = Counter()
delay_counts = Counter()

with open(train_file, "r", encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)

    for row in reader:
        row_count += 1

        for key, value in row.items():
            if value is None or value.strip() == "":
                missing_counts[key] += 1

        if "is_delayed" in row:
            delay_counts[row["is_delayed"]] += 1

print(f"Total rows: {row_count:,}")

print("\nTarget distribution:")
for key, value in delay_counts.items():
    print(f"  {key}: {value:,}")

print("\nColumns with missing values:")
for key, value in missing_counts.most_common():
    if value:
        percentage = (value / row_count) * 100
        print(f"  {key}: {value:,} ({percentage:.2f}%)")

print("\n" + "=" * 80)
print("INSPECTION COMPLETE")
print("=" * 80)