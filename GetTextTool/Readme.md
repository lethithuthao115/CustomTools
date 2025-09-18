# Cài đặt và cách thức hoạt động
## Python
. Python version 3.10+ (Hiện tại: Python 3.10.11) <br>
. Lên [trang download của Python](https://www.python.org/downloads/) để download version python cần dùng xuống <br>
. Cài đặt python <br>
. Kiểm tra lại version bằng lệnh: <br>

```
python --version
```
hoặc
```
pip --version
``` 

## Thư viện Google API Client 
Chạy lệnh
```
pip install google-api-python-client
``` 

## Chuẩn bị Google API Credentials
Các bước tạo: <br>
. Vào [Google Cloud Console](https://console.cloud.google.com/) <br>
. Tạo dự án mới hoặc chọn dự án hiện tại. <br>
. Bật API: Google Drive API và Google Docs API. <br>
. Tạo Service Account trong IAM & Admin. <br>
. Tạo khóa dạng JSON, tải về, đặt tên thành Google.json. <br>
. Đặt file Google.json vào cùng thư mục với script hoặc file .exe. <br>
Có thể dùng sẵn file đã được tạo và upload trên drive cá nhân. <br>

## File input.txt 
. Script đọc các link thư mục Google Drive từ input.txt. <br>
. Bạn cần tạo file input.txt cùng thư mục script với mỗi dòng là link folder Google Drive, ví dụ: <br>
```
https://drive.google.com/drive/folders/ABC123xyz...
https://drive.google.com/drive/folders/DEF456uvw...
``` 

## Thư mục output 
. Script tự tạo thư mục output để lưu file kết quả. 

## Các quyền cần thiết cho Service Account 
. Service Account phải có quyền truy cập các folder Google Drive đó (thường phải được chia sẻ folder cho email Service Account). <br>
. Nếu folder là folder của user khác, phải chia sẻ hoặc cấp quyền. <br>

## Chạy script 
. Chạy bằng lệnh
```
python your_script_name.py
``` 
Ở đây script name là GetText 

# Hướng dẫn build thành exe 
## Cài PyInstaller 
Chạy lệnh 
```
pip install pyinstaller
``` 

## Chuẩn bị thư mục dự án 
Tên_dự_án/ <br>
│ <br>
├── script.py              # Script chính (GetText.py) <br>
└── (có thể thêm icon.ico nếu muốn gắn icon cho file .exe) <br>
Chú ý: Vì file json chứa key API của google nên không nên nhúng vào trong build. <br>
Chú ý: Đã xử lý việc loại bỏ config json và input.txt ra khỏi build. 

## Build bằng PyInstaller 
Chạy lệnh sau trong Terminal hoặc CMD, từ thư mục chứa script: 
```
pyinstaller --onefile script.py
``` 
Thêm --noconsole nếu không muốn in log ra màn hình 

## Kết quả sau khi build 
PyInstaller sẽ tạo ra các thư mục sau: <br>
dist/ <br>
    script.exe        <-- File chạy chính <br>
build/ <br>
    ... <br>
__pycache__/ <br>
script.spec           <-- File cấu hình build (tùy chỉnh nâng cao) <br>

## Chạy thử exe 
Chạy dòng lệnh nếu có cả icon, còn không thì bỏ đoạn --icon=icon.ico 
```
pyinstaller --onefile --icon=icon.ico script.py
``` 
## Chú ý 
Cần đảm bảo lúc chạy .exe, file Google.json và input.txt nằm cùng thư mục. 