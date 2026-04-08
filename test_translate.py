import os
import time
from bs4 import BeautifulSoup, NavigableString
from googletrans import Translator

translator = Translator()

files = ['thanks.html', 'index.html', 'menu.html', 'order.html', 'franchise.html']

for filepath in files:
    if not os.path.exists(filepath): continue
    print(f"Processing {filepath}")
    with open(filepath, 'r', encoding='utf-8') as f:
        html_doc = f.read()
        html_doc = html_doc.replace('lang="en"', 'lang="de"')
        soup = BeautifulSoup(html_doc, 'html.parser')
        
    for string_node in soup.find_all(string=True):
        parent = string_node.parent
        if parent.name in ['script', 'style', 'head', 'title', 'meta'] or 'lang-toggle' in str(parent.parent):
            continue
            
        text = string_node.string
        # Ignore empty str or just newlines/symbols
        if text and len(text.strip()) > 1 and any(c.isalpha() for c in text):
            try:
                # Add delay
                time.sleep(0.05)
                res = translator.translate(text.strip(), src='en', dest='de')
                new_text = text.replace(text.strip(), res.text)
                string_node.replace_with(NavigableString(new_text))
            except Exception as e:
                print(f"Failed: {text.strip()} -> {e}")
                time.sleep(1)

    for input_node in soup.find_all('input'):
        if input_node.has_attr('placeholder'):
            text = input_node['placeholder']
            if text.strip():
                try:
                    res = translator.translate(text.strip(), src='en', dest='de')
                    input_node['placeholder'] = res.text
                except:
                    pass
                    
    for ta_node in soup.find_all('textarea'):
        if ta_node.has_attr('placeholder'):
            text = ta_node['placeholder']
            if text.strip():
                try:
                    res = translator.translate(text.strip(), src='en', dest='de')
                    ta_node['placeholder'] = res.text
                except:
                    pass

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(str(soup))
        
print("Done")
