import re

target_files = ['index.html', 'menu.html', 'js/main.js']

beverage_keywords = re.compile(r'(shake|soda|cola|sprite|fanta|water|drinks)', re.IGNORECASE)

def process_file(filepath):
    print(f"Processing {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    new_lines = []
    
    # regex to match:
    # 1. €... or +€... 
    # 2. price: ...
    # 3. data-price="..."
    # 4. 'Item Name': 2.50 (in referencePrices) -> match colon then space then digits
    # 5. foodGross: ...
    pattern = re.compile(r'(€|\+€|price:\s*|data-price=\"|:\s*|foodGross:\s*)([0-9]+\.[0-9]{2})')

    for line in lines:
        def replacer(match):
            prefix = match.group(1)
            price = float(match.group(2))
            
            # Skip invalid logic constants or unrelated coordinates
            if price == 0.0 or price in [1.07, 1.19, 3.12]:
                return match.group(0)
            if 'fee' in line.lower() or 'distance' in line.lower() or 'finalTotal' in line.lower() or 'lat' in line.lower() or 'lon' in line.lower():
                return match.group(0)
            if 'change.toFixed' in line or 'subtotal' in line:
                return match.group(0)
                
            # If the script has `beverageGross:` it will match. But `beverageGross` is not in our prefix list, so `beverageGross: 0` is bypassed since price is 0.00. Wait, `beverageGross: 0` is 0.
            
            # Determine multiplier
            multiplier = 1.07
            if beverage_keywords.search(line):
                multiplier = 1.19
                
            # Exceptions
            if 'Classic Fries' in line and price == 2.49: multiplier = 1.07
            if 'Sweet Potato Fries' in line and price == 2.99: multiplier = 1.07 # In main.js literal
            if 'Chocolate Shake' in line or 'Vanilla Shake' in line or 'Strawberry Shake' in line: multiplier = 1.19
            if 'Mineral Water' in line: multiplier = 1.19
            
            # Exception for CSS or unrelated colon formats
            if prefix.strip() == ':' and ('€' not in prefix):
                # Only apply to referencePrices dictionary map
                if "'" not in line and '"' not in line: 
                    # If it's something like "display: 2.00" -> unlikely, but protect against it
                    return match.group(0)
            
            new_price = round(price * multiplier, 2)
            str_price = f"{new_price:.2f}"
            print(f"Old: {price} -> New: {str_price} | Prefix: {prefix} | Line: {line.strip()}")
            return f"{prefix}{str_price}"
            
        new_line = pattern.sub(replacer, line)
        new_lines.append(new_line)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

for f in target_files:
    process_file(f)
