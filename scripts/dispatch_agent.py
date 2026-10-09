import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

# 各エージェントのCursor Webhook URL
WEBHOOK_URLS = {
    "inspector": os.environ.get("CURSOR_WEBHOOK_INSPECTOR") or "https://api2.cursor.sh/automations/webhook/6d35e176-c35a-11f1-ac31-5e2d0494121f",
    "lead": os.environ.get("CURSOR_WEBHOOK_LEAD") or "https://api2.cursor.sh/automations/webhook/9d6353c0-c35a-11f1-ac31-5e2d0494121f",
    "arrow": os.environ.get("CURSOR_WEBHOOK_ARROW") or "https://api2.cursor.sh/automations/webhook/bbfd7104-c35a-11f1-ac31-5e2d0494121f",
    "javelin": os.environ.get("CURSOR_WEBHOOK_JAVELIN") or "https://api2.cursor.sh/automations/webhook/c886f192-c35a-11f1-ac31-5e2d0494121f",
    "tomahawk": os.environ.get("CURSOR_WEBHOOK_TOMAHAWK") or "https://api2.cursor.sh/automations/webhook/deb8a65d-c35a-11f1-ac31-5e2d0494121f",
}

def extract_json_block(text: str):
    """コメント本文から ```json ... ``` ブロックを抽出する"""
    pattern = r"```json\s*(\{.*?\})\s*```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            print("Warning: JSON block found but could not be parsed.")
    return None

def main():
    comment_body = os.environ.get("COMMENT_BODY", "")
    issue_number = os.environ.get("ISSUE_NUMBER", "")
    pr_number = os.environ.get("PR_NUMBER", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")

    data = extract_json_block(comment_body)
    if not data:
        print("No valid command JSON block found. Skipping dispatch.")
        sys.exit(0)

    recipient = str(data.get("recipient", "")).lower().strip()
    sender = str(data.get("sender", "")).lower().strip()
    msg_type = data.get("type", "")

    print(f"Message detected: from=[{sender}] to=[{recipient}], type=[{msg_type}]")

    if recipient == "owner" or recipient == "xyngwie":
        print(f"Recipient is human owner ({recipient}). Skipping webhook dispatch.")
        sys.exit(0)

    target_webhook = WEBHOOK_URLS.get(recipient)
    if not target_webhook:
        print(f"Error: Webhook for recipient '{recipient}' is not defined.")
        sys.exit(1)

    target_id = f"PR #{pr_number}" if pr_number else f"Issue #{issue_number}"
    payload = {
        "context": (
            f"【自動連携通知】\n"
            f"リポジトリ: {repo}\n"
            f"対象: {target_id}\n"
            f"送信元エージェント: {sender}\n"
            f"種別: {msg_type}\n\n"
            f"受信したJSONデータ:\n{json.dumps(data, ensure_ascii=False, indent=2)}\n\n"
            f"指示: あなたは「{recipient}」です。上記の指示内容・報告を精査し、あなたの役割に沿って次のアクションを実行してください。"
            f"次のエージェントに渡すメッセージがある場合は、必ず ```json ... ``` の形式でコメント欄に出力してください。"
        )
    }

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Cursor-Dispatcher/1.0"
    }

    api_key = (
        os.environ.get(f"CURSOR_AUTOMATIONS_{recipient.upper()}")
        or os.environ.get(f"CURSOR_KEY_{recipient.upper()}")
        or os.environ.get("CURSOR_API_KEY")
        or ""
    ).strip()
    if api_key.lower().startswith("authorization:"):
        api_key = api_key.split(":", 1)[1].strip()
    if api_key.lower().startswith("bearer "):
        api_key = api_key[7:].strip()
    if not api_key:
        print(
            f"Error: Authorization token for recipient '{recipient}' is not set. "
            f"Expected GitHub Actions secret CURSOR_AUTOMATIONS_{recipient.upper()}."
        )
        sys.exit(1)
    headers["Authorization"] = f"Bearer {api_key}"

    req_data = json.dumps(payload).encode("utf-8")

    max_retries = 4
    retry_delay_sec = 30

    for attempt in range(1, max_retries + 1):
        req = urllib.request.Request(
            target_webhook,
            data=req_data,
            headers=headers,
            method="POST"
        )
        try:
            print(f"Triggering {recipient}... (attempt {attempt}/{max_retries})")
            with urllib.request.urlopen(req) as res:
                print(f"Successfully triggered {recipient}! HTTP {res.status}")
                sys.exit(0)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='replace')
            print(f"Attempt {attempt} failed: HTTP {e.code} - {error_body}")
            # 同時実行制限エラーやレートリミット等の場合にリトライ
            if attempt < max_retries:
                print(f"Waiting {retry_delay_sec}s for slots to free up before retrying...")
                time.sleep(retry_delay_sec)
            else:
                print(f"All {max_retries} attempts failed to trigger {recipient}.")
                sys.exit(1)
        except urllib.error.URLError as e:
            print(f"Attempt {attempt} connection error: {e.reason}")
            if attempt < max_retries:
                print(f"Waiting {retry_delay_sec}s before retrying...")
                time.sleep(retry_delay_sec)
            else:
                print(f"All {max_retries} attempts failed.")
                sys.exit(1)

if __name__ == "__main__":
    main()
