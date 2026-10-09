import json
import os
import re
import sys
import urllib.request
import urllib.error

WEBHOOK_URLS = {
    "inspector": os.environ.get("CURSOR_WEBHOOK_INSPECTOR") or "https://api2.cursor.sh/automations/webhook/6d35e176-c35a-11f1-ac31-5e2d0494121f",
    "lead": os.environ.get("CURSOR_WEBHOOK_LEAD") or "https://api2.cursor.sh/automations/webhook/9d6353c0-c35a-11f1-ac31-5e2d0494121f",
    "arrow": os.environ.get("CURSOR_WEBHOOK_ARROW") or "https://api2.cursor.sh/automations/webhook/bbfd7104-c35a-11f1-ac31-5e2d0494121f",
    "javelin": os.environ.get("CURSOR_WEBHOOK_JAVELIN") or "https://api2.cursor.sh/automations/webhook/c886f192-c35a-11f1-ac31-5e2d0494121f",
    "tomahawk": os.environ.get("CURSOR_WEBHOOK_TOMAHAWK") or "https://api2.cursor.sh/automations/webhook/deb8a65d-c35a-11f1-ac31-5e2d0494121f",
}

# 各 Automation の "Generate auth header" が発行するキー。
# "Bearer " 付きでも、キー本体だけでも受け付ける。
WEBHOOK_AUTHS = {
    "inspector": os.environ.get("CURSOR_WEBHOOK_AUTH_INSPECTOR", ""),
    "lead": os.environ.get("CURSOR_WEBHOOK_AUTH_LEAD", ""),
    "arrow": os.environ.get("CURSOR_WEBHOOK_AUTH_ARROW", ""),
    "javelin": os.environ.get("CURSOR_WEBHOOK_AUTH_JAVELIN", ""),
    "tomahawk": os.environ.get("CURSOR_WEBHOOK_AUTH_TOMAHAWK", ""),
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

    auth = str(WEBHOOK_AUTHS.get(recipient, "")).strip()
    if not auth:
        secret_name = f"CURSOR_WEBHOOK_AUTH_{recipient.upper()}"
        print(
            f"Error: Authorization token for recipient '{recipient}' is not set. "
            f"Add GitHub Actions secret {secret_name} "
            f"(the key from that automation's Generate auth header)."
        )
        sys.exit(1)
    if auth.lower().startswith("bearer "):
        auth = auth[7:].strip()

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

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        target_webhook,
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Cursor-Dispatcher/1.0",
            "Authorization": f"Bearer {auth}",
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as res:
            print(f"Successfully triggered {recipient}! HTTP {res.status}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        detail = re.sub(r"crsr_\S+", "<key>", detail)
        detail = re.sub(r"Bearer\s+\S+", "Bearer <redacted>", detail)
        print(f"Failed to trigger {recipient}: HTTP {e.code} - {detail}")
        sys.exit(1)

if __name__ == "__main__":
    main()
