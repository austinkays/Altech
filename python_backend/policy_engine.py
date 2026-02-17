import sys

from pypdf import PdfReader


def extract_text(file_path: str) -> str:
    reader = PdfReader(file_path)
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n".join(pages)


def main():
    if len(sys.argv) < 2:
        print("ERROR: No file path provided", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]

    try:
        text = extract_text(file_path)
        print(text)
    except FileNotFoundError:
        print(f"ERROR: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Failed to process PDF: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
