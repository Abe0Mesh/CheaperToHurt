import pandas as pd

df = pd.read_csv("income_file.csv")

# Select median income row
row = df[df["Label (Grouping)"] == "Median income (dollars)"]

if row.empty:
    print("Median income row not found.")
    print(df["Label (Grouping)"].unique())
    exit()

row = row.iloc[0]

data = []

for col in df.columns:
    if "Households!!Estimate" in col:
        state = col.split("!!")[0]
        income = str(row[col]).replace(",", "").strip()

        if income == "-" or income == "":
            continue

        data.append({
            "state": state,
            "median_income": int(income)
        })

income_df = pd.DataFrame(data)

# Remove Puerto Rico if present
income_df = income_df[income_df["state"] != "Puerto Rico"]

income_df["monthly_income"] = (income_df["median_income"] / 12).round(0).astype(int)

income_df.to_csv("state_income.csv", index=False)

print("Created state_income.csv")
print(income_df.head())
print("Total states:", len(income_df))

# Load insurance dataset
insurance_df = pd.read_csv("insurance_master.csv")

# Merge on state
merged_df = pd.merge(insurance_df, income_df, on="state", how="inner")

# Save final master dataset
merged_df.to_csv("insurance_master_full.csv", index=False)

print("Created insurance_master_full.csv")
print(merged_df.head())
print("Total states merged:", len(merged_df))
