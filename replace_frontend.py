import os

def replace_in_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    orig = content
    for old, new in replacements:
        content = content.replace(old, new)
    if orig != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

base_dir = r'c:\Users\abuel\OneDrive\Documents\26code\030625\frontend\src'

replacements = [
    ('Weekly Report', 'Monthly Report'),
    ('weekly-report', 'monthly-report'),
    ('weekly_report', 'monthly_report'),
    ('WeeklyReport', 'MonthlyReport'),
    ('Weekly Progress Report', 'Monthly Progress Report'),
    ('Weekly Progress reporting', 'Monthly Progress reporting'),
    ('Weekly Progress', 'Monthly Progress'),
    ('weekly progress', 'monthly progress'),
    ('Weekly progress', 'Monthly progress'),
    ('weekly report', 'monthly report'),
    ('Weekly report', 'Monthly report'),
    ('WEEKLY', 'MONTHLY'),
    ('isWeekly', 'isMonthly'),
    ('weeklyLoading', 'monthlyLoading'),
    ('weeklyEnabled', 'monthlyEnabled'),
    ('handleGenerateWeekly', 'handleGenerateMonthly'),
    ('next_week_focus_areas', 'next_month_focus_areas'),
    ('isMonthly ? "WK"', 'isMonthly ? "MO"'),
    ('weekly therapy goals', 'monthly therapy goals'),
]

print("starting replacement")
for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            path = os.path.join(root, file)
            if 'specialist-a' in path: continue
            replace_in_file(path, replacements)
print("done replacement")
