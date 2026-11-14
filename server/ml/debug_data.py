import pandas as pd
import numpy as np

df = pd.read_csv(r'C:\Users\NEW\Desktop\CBP\server\data\ml\eta_dataset_v1.csv')
df['event_type'] = df['event_type'].fillna('None')

# Check target distribution by split
for split in ['train', 'validation', 'test']:
    s = df[df['split'] == split]['target_delay_minutes']
    print(f"{split}: n={len(s)}, mean={s.mean():.2f}, std={s.std():.2f}, min={s.min():.1f}, max={s.max():.1f}")

# Check if sections differ between splits
print('\nSection counts per split:')
for split in ['train', 'validation', 'test']:
    s = df[df['split'] == split]
    sections = s.groupby(['from_station', 'to_station']).size()
    print(f"  {split}: {len(sections)} unique sections, total={len(s)}")

# Check distribution of historical_mean_delay
for split in ['train', 'validation', 'test']:
    s = df[df['split'] == split]
    print(f"{split} historical_mean_delay: mean={s['historical_mean_delay'].mean():.2f}, std={s['historical_mean_delay'].std():.2f}")

# Check event distribution
for split in ['train', 'validation', 'test']:
    s = df[df['split'] == split]
    print(f"{split} event_active: {s['event_active'].value_counts().to_dict()}")

# Check train_number distribution per split
for split in ['train', 'validation', 'test']:
    s = df[df['split'] == split]
    print(f"{split} trains: {s['train_number'].value_counts().to_dict()}")
