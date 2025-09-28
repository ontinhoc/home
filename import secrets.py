import secrets, random

digits = "0123456789"
lower = "abcdefghijklmnopqrstuvwxyz"
upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
special = "!@#$%^&*()-_=+[]{};:,.<>?/|\\"

def generate_password_4():
    chars = [
        secrets.choice(digits),
        secrets.choice(lower),
        secrets.choice(upper),
        secrets.choice(special),
    ]
    random.shuffle(chars)  # xáo trộn vị trí
    return ''.join(chars)

print(generate_password_4())
