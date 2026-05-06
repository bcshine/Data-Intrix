import requests

with open('더벨스파콘래드.xlsx', 'rb') as f:
    files = {'file': f}
    response = requests.post('http://localhost:3000/api/analyze', files=files)
    print(response.json())
