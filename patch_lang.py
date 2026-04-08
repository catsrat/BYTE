import os

files = ['index.html', 'menu.html', 'order.html', 'thanks.html', 'franchise.html']

toggle_str = """            <div class="lang-toggle">
                <button class="lang-btn" data-lang="en" onclick="switchLanguage('en')">EN</button>
                <span>|</span>
                <button class="lang-btn" data-lang="de" onclick="switchLanguage('de')">DE</button>
            </div>
"""

widget_str = """    <div id="google_translate_element" style="display:none;"></div>
    <script type="text/javascript" src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>
"""

for f in files:
    if os.path.exists(f):
        with open(f, 'r') as fp:
            content = fp.read()
        
        # Inject toggle 
        if "lang-toggle" not in content:
            content = content.replace('<div class="hamburger"', toggle_str + '            <div class="hamburger"')
        
        # Inject widget
        if "google_translate_element" not in content:
            content = content.replace('</body>', widget_str + '</body>')
            
        with open(f, 'w') as fp:
            fp.write(content)
            
print("Done patching HTML files!")
