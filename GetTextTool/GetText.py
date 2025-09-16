import os
import time
import re
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

import sys

# Xác định thư mục chứa file .exe hoặc script Python
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)  # Thư mục chứa file .exe
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # Thư mục chứa script .py

GOOGLE_CREDENTIALS = os.path.join(BASE_DIR, "Google.json")

# Kiểm tra file có tồn tại không
if not os.path.exists(GOOGLE_CREDENTIALS):
    print(f"❌ Không tìm thấy Google.json! Đặt nó cùng thư mục với file .exe.")
    input("Nhấn Enter để thoát...")
    sys.exit(1)

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS

print(f"✅ Đã tìm thấy Google.json tại: {GOOGLE_CREDENTIALS}")

output_dir = "output"
os.makedirs(output_dir, exist_ok=True)

def authenticate_drive():
    """Xác thực Google Drive API"""
    return build("drive", "v3")

def authenticate_docs():
    """Xác thực Google Docs API"""
    return build("docs", "v1")

def read_input_file():
    """Luôn đọc nội dung file input.txt khi chạy"""
    input_file = os.path.join(BASE_DIR, "input.txt")  # BASE_DIR đã được xác định ở đầu code
    
    if not os.path.exists(input_file):
        print(f"❌ Không tìm thấy input.txt tại: {input_file}")
        input("Nhấn Enter để thoát...")
        sys.exit(1)

    print(f"✅ Đã tìm thấy input.txt tại: {input_file}")

    with open(input_file, "r", encoding="utf-8") as f:
        drive_links = [line.strip() for line in f if line.strip()]  # Loại bỏ dòng trống

    if not drive_links:
        print("❌ input.txt không chứa link hợp lệ!")
        input("Nhấn Enter để thoát...")
        sys.exit(1)

    print("📂 Danh sách thư mục Google Drive cần xử lý:")
    for link in drive_links:
        print(f"- {link}")

    return drive_links
    
def extract_folder_id(drive_link):
    """Trích xuất Folder ID từ đường link Google Drive"""
    match = re.search(r"folders/([\w-]+)", drive_link)
    return match.group(1) if match else None

def extract_number_from_filename(filename):
    """Trích xuất số thứ tự từ tên file (ví dụ: '01.webp' -> 1)"""
    match = re.search(r'\d+', filename)
    return int(match.group()) if match else float('inf')

def list_subfolders(drive_service, parent_folder_id):
    """Lấy danh sách thư mục con theo thứ tự số thứ tự"""
    query = f"'{parent_folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    results = drive_service.files().list(q=query, fields="files(id, name)").execute()
    subfolders = results.get("files", [])
    
    # Sắp xếp theo số thứ tự nếu có số
    subfolders.sort(key=lambda folder: extract_number_from_filename(folder["name"]))
    return subfolders

def list_images_in_drive_folder(drive_service, folder_id):
    """Lấy danh sách ảnh trong thư mục trên Google Drive"""
    query = f"'{folder_id}' in parents and mimeType contains 'image/'"
    results = drive_service.files().list(q=query, fields="files(id, name)").execute()
    images = results.get("files", [])
    
    # Sắp xếp ảnh theo số thứ tự
    images.sort(key=lambda img: extract_number_from_filename(img["name"]))
    return images

def convert_image_to_google_doc(drive_service, file_id, file_name, retry_attempts=3):
    """Chuyển ảnh thành Google Docs (OCR) với Retry khi gặp lỗi 500"""
    for attempt in range(retry_attempts):
        try:
            new_file = drive_service.files().copy(
                fileId=file_id,
                body={"mimeType": "application/vnd.google-apps.document", "name": f"OCR_{file_name}"}
            ).execute()
            print(f"📄 Đã tạo Google Docs từ ảnh: {file_name}")
            return new_file["id"]
        except HttpError as e:
            if e.resp.status == 500:
                print(f"⚠️ Lỗi 500, thử lại lần {attempt + 1}/{retry_attempts} cho ảnh: {file_name}")
                time.sleep(5)
            else:
                break  # Không retry nếu lỗi khác
    print(f"❌ Bỏ qua ảnh: {file_name} do lỗi khi chuyển thành Google Docs")
    return None

def extract_text_from_google_doc(docs_service, doc_id):
    """Trích xuất văn bản từ Google Docs đã OCR"""
    time.sleep(10)  # Chờ Google OCR xử lý
    try:
        document = docs_service.documents().get(documentId=doc_id).execute()
        content = document.get("body", {}).get("content", [])
        
        extracted_text = ""
        for elem in content:
            if "paragraph" in elem:
                for text_run in elem["paragraph"].get("elements", []):
                    extracted_text += text_run.get("textRun", {}).get("content", "")

        return extracted_text.strip()
    except Exception as e:
        print(f"⚠️ Lỗi khi đọc Google Docs ID {doc_id}: {e}")
        return ""

def delete_google_doc(drive_service, doc_id):
    """Xóa Google Docs sau khi trích xuất văn bản"""
    try:
        drive_service.files().delete(fileId=doc_id).execute()
        print(f"🗑️ Đã xóa Google Docs ID: {doc_id}")
    except Exception as e:
        print(f"⚠️ Lỗi khi xóa file {doc_id}: {e}")

def process_images_from_folder(folder_id, folder_name):
    """Xử lý ảnh trong thư mục cụ thể trên Google Drive"""
    drive_service = authenticate_drive()
    docs_service = authenticate_docs()
    images = list_images_in_drive_folder(drive_service, folder_id)

    if not images:
        print(f"❌ Không tìm thấy ảnh nào trong thư mục: {folder_name}")
        return

    all_text = ""
    error_log = ""

    for image in images:
        print(f"🖼 Đang xử lý ảnh: {image['name']} (ID: {image['id']})")
        doc_id = convert_image_to_google_doc(drive_service, image["id"], image["name"])

        if doc_id:
            text = extract_text_from_google_doc(docs_service, doc_id)
            all_text += f"\n\n{image['name']}\n\n\n{text}"
            delete_google_doc(drive_service, doc_id)
        else:
            error_log += f"{image['name']}\n"

    # Lưu kết quả văn bản    
    output_file = os.path.join(output_dir, f"extracted_text_{folder_name}.txt")
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(all_text)

    # Ghi file lỗi nếu có ảnh bị bỏ qua
    if error_log:
        with open("Error.txt", "a", encoding="utf-8") as f:
            f.write(f"\n=== Thư mục: {folder_name} ===\n{error_log}")

    print(f"✅ Hoàn thành! Kết quả lưu tại: {output_file}")

def process_all_folders():
    """Xử lý tất cả thư mục trong danh sách input.txt"""
    drive_service = authenticate_drive()
    folder_links = read_input_file()

    if not folder_links:
        print("❌ Không có thư mục nào trong input.txt!")
        return

    for link in folder_links:
        folder_id = extract_folder_id(link)
        if not folder_id:
            print(f"⚠️ Không thể trích xuất Folder ID từ link: {link}")
            continue

        print(f"📂 Đang xử lý thư mục: {link}")

        # Lấy tên thư mục chính
        try:
            folder_metadata = drive_service.files().get(fileId=folder_id, fields="name").execute()
            main_folder_name = folder_metadata["name"]
        except Exception as e:
            print(f"⚠️ Lỗi khi lấy tên thư mục {folder_id}: {e}")
            main_folder_name = "UnknownFolder"

        subfolders = list_subfolders(drive_service, folder_id)

        if subfolders:
            for subfolder in subfolders:
                process_images_from_folder(subfolder['id'], subfolder['name'])
        else:
            # Nếu không có thư mục con, xử lý ảnh trong thư mục chính với tên thật của nó
            process_images_from_folder(folder_id, main_folder_name)

# 🔥 Chạy chương trình
if __name__ == "__main__":
    process_all_folders()
