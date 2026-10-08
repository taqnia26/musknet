from pathlib import Path
import fitz

source = Path("attached_assets/ML-0006_1791491037769.pdf")
output = Path(".agents/outputs/invoice-ml0006")
output.mkdir(parents=True, exist_ok=True)
doc = fitz.open(source)
print("Pages:", len(doc))
for number, page in enumerate(doc, 1):
    path = output / f"page-{number}.png"
    page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(path)
    print(path, page.rect)
    print(page.get_text())
