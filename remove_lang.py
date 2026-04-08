import os, re

files = ['index.html', 'menu.html', 'order.html', 'franchise.html', 'thanks.html']

for f in files:
    if not os.path.exists(f): continue
    with open(f, 'r', encoding='utf-8') as fp:
        c = fp.read()

    # Remove the lang-toggle div block
    c = re.sub(r'\n?<div class="lang-toggle">.*?</div>\n?', '\n', c, flags=re.DOTALL)

    # Remove google_translate_element div
    c = re.sub(r'\n?<div id="google_translate_element".*?</div>\n?', '\n', c, flags=re.DOTALL)

    # Remove google translate script tag
    c = re.sub(r'\n?<script[^>]*translate\.google\.com[^>]*>.*?</script>\n?', '\n', c, flags=re.DOTALL)

    with open(f, 'w', encoding='utf-8') as fp:
        fp.write(c)

    print(f"Cleaned {f}")

print("Done!")
