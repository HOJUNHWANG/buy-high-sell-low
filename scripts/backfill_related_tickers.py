"""Compatibility entrypoint for the grounded news-quality repair pipeline."""
from repair_news_quality import main
if __name__ == "__main__":
    print("Using source-grounded news repair; previous analysis is privately archived.")
    main()
