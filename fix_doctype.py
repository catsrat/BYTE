import os
files = ['thanks.html', 'index.html', 'menu.html', 'order.html', 'franchise.html']

for f in files:
    if os.path.exists(f):
        with open(f, 'r') as fp:
            c = fp.read()
        if c.startswith('html\n<html lang="de">'):
            c = c.replace('html\n<html lang="de">', '<!DOCTYPE html>\n<html lang="de">', 1)
        with open(f, 'w') as fp:
            fp.write(c)
