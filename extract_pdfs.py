import PyPDF2
import os

pdf_files = [
    "io/Parent Input.pdf",
    "io/Teacher Input.pdf",
    "io/Specialist Input A.pdf",
    "io/Specialist Input B.pdf"
]

for pdf_file in pdf_files:
    if not os.path.exists(pdf_file):
        continue
    txt_file = pdf_file.replace('.pdf', '.txt')
    with open(txt_file, "w", encoding="utf-8") as f:
        reader = PyPDF2.PdfReader(pdf_file)
        for page in reader.pages:
            f.write(page.extract_text() + "\n")
    print(f"Extracted {pdf_file} to {txt_file}")
