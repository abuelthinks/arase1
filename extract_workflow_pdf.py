import PyPDF2
import os

pdf_file = "io/REPORTING APP WORKFLOW AND CONTENTS.pdf"
txt_file = "io/REPORTING APP WORKFLOW AND CONTENTS.txt"

with open(txt_file, "w", encoding="utf-8") as f:
    reader = PyPDF2.PdfReader(pdf_file)
    for page in reader.pages:
        f.write(page.extract_text() + "\n")
print(f"Extracted {pdf_file} to {txt_file}")
