# ==============================================================================
# LITTLE CLOUD SHOP - PYTHON BACKEND SERVER
# Supports Omise PromptPay Charges API, Webhook, Polling, and Static File Serving
# ==============================================================================

import os
import json
import base64
import time
import urllib.request
import urllib.error
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from datetime import datetime, timezone

PORT = 3000

# Load .env file
ENV_VARS = {}
if os.path.exists('.env'):
    with open('.env', 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                ENV_VARS[key.strip()] = val.strip()

OMISE_SECRET_KEY = ENV_VARS.get('OMISE_SECRET_KEY', '')
SUPABASE_URL = ENV_VARS.get('SUPABASE_URL', 'https://hwzdowxjxtdhcgiylnbo.supabase.co')
SUPABASE_KEY = ENV_VARS.get('SUPABASE_SERVICE_ROLE_KEY') or ENV_VARS.get('SUPABASE_ANON_KEY', 'sb_publishable_5ZvVjg1viXXX_vli5gdhAA_j4lSg5j4')

def call_supabase_rpc(rpc_name, params):
    """Call Supabase Stored Procedure / RPC"""
    if not SUPABASE_KEY or 'hwzdowxjxtdhcgiylnbo' not in SUPABASE_URL:
        return None
    url = f"{SUPABASE_URL}/rest/v1/rpc/{rpc_name}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    data = json.dumps(params).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return None

def call_supabase_rest(table, method='GET', body=None, query=''):
    """Call Supabase REST API"""
    if not SUPABASE_KEY or 'hwzdowxjxtdhcgiylnbo' not in SUPABASE_URL:
        return None
    url = f"{SUPABASE_URL}/rest/v1/{table}{query}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    data = json.dumps(body).encode('utf-8') if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            content = resp.read().decode('utf-8')
            return json.loads(content) if content else {}
    except Exception as e:
        return None

def call_omise_charge(amount_satang, user_id, username):
    """Call Omise Charges API to create PromptPay QR code"""
    auth_str = f"{OMISE_SECRET_KEY}:"
    auth_b64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
    headers = {
        "Authorization": f"Basic {auth_b64}",
        "Content-Type": "application/json"
    }
    payload = {
        "amount": amount_satang,
        "currency": "THB",
        "source": {
            "type": "promptpay"
        },
        "metadata": {
            "user_id": user_id,
            "username": username or "Member",
            "shop": "Little Cloud Shop"
        }
    }
    req = urllib.request.Request("https://api.omise.co/charges", data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

# In-memory transaction cache
MEM_TRANSACTIONS = {}

CHAT_FILE = 'chat_history.json'
SLIP_SESSIONS = {}

def get_lan_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def load_chat_history():
    if os.path.exists(CHAT_FILE):
        try:
            with open(CHAT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_chat_history(chats):
    try:
        with open(CHAT_FILE, 'w', encoding='utf-8') as f:
            json.dump(chats, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Chat Save Warning] {e}")

class LittleCloudHandler(SimpleHTTPRequestHandler):
    def _send_json(self, status_code, data):
        response_bytes = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(response_bytes)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('content-length', 0))
        raw_data = self.rfile.read(length).decode('utf-8') if length > 0 else "{}"
        try:
            body = json.loads(raw_data) if raw_data else {}
        except Exception as err:
            return self._send_json(400, {"success": False, "message": f"Invalid JSON: {err}"})

        # 1. POST /api/topup/create
        if self.path == '/api/topup/create':
            user_id = body.get('user_id')
            username = body.get('username', 'Member')
            try:
                amount = float(body.get('amount', 0))
            except (ValueError, TypeError):
                return self._send_json(400, {"success": False, "message": "Invalid amount format"})

            if not user_id:
                return self._send_json(400, {"success": False, "message": "Missing user_id"})
            if amount < 1 or amount > 50000:
                return self._send_json(400, {"success": False, "message": "Amount must be between 1 and 50,000 THB"})

            amount_satang = int(round(amount * 100))
            charge_id = f"chrg_omise_{int(time.time())}_{int(amount)}"
            qr_url = f"https://promptpay.io/0815993194/{amount}.png"
            expires_at = datetime.fromtimestamp(time.time() + 900, tz=timezone.utc).isoformat()

            # If real Omise Secret Key is provided -> Call Omise API
            if OMISE_SECRET_KEY and not OMISE_SECRET_KEY.startswith('skey_test_xxxx') and len(OMISE_SECRET_KEY) > 10:
                try:
                    omise_res = call_omise_charge(amount_satang, user_id, username)
                    charge_id = omise_res.get('id', charge_id)
                    source = omise_res.get('source', {})
                    scannable = source.get('scannable_code', {})
                    img_data = scannable.get('image', {})
                    qr_url = img_data.get('download_uri', qr_url)
                    if omise_res.get('expires_at'):
                        expires_at = omise_res.get('expires_at')
                except Exception as e:
                    print(f"[Omise Live API Warning] {e}")

            # Store in Memory Cache
            MEM_TRANSACTIONS[charge_id] = {
                "user_id": user_id,
                "username": username,
                "omise_charge_id": charge_id,
                "amount": amount,
                "status": "pending",
                "qr_code_url": qr_url,
                "expires_at": expires_at,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            # Insert pending topup transaction into Supabase
            try:
                call_supabase_rest('topup_transactions', method='POST', body={
                    "user_id": user_id,
                    "username": username,
                    "omise_charge_id": charge_id,
                    "amount": amount,
                    "status": "pending",
                    "qr_code_url": qr_url,
                    "expires_at": expires_at
                })
            except Exception as dbErr:
                print(f"[DB Topup Insert Warning] {dbErr}")

            return self._send_json(200, {
                "success": True,
                "charge_id": charge_id,
                "amount": amount,
                "currency": "THB",
                "qr_code_url": qr_url,
                "expires_at": expires_at
            })

        # 2. POST /api/webhook/omise
        elif self.path == '/api/webhook/omise':
            data = body.get('data', {})
            if data.get('object') == 'charge':
                charge_id = data.get('id')
                status = data.get('status')
                paid = data.get('paid', False)

                if charge_id in MEM_TRANSACTIONS:
                    MEM_TRANSACTIONS[charge_id]['status'] = 'completed' if (status == 'successful' and paid) else status

                if status == 'successful' and paid:
                    txs = call_supabase_rest('topup_transactions', query=f"?omise_charge_id=eq.{charge_id}")
                    if txs and len(txs) > 0:
                        tx = txs[0]
                        if tx.get('status') != 'completed':
                            call_supabase_rpc('credit_user_wallet_atomic', {
                                "p_user_id": tx.get('user_id'),
                                "p_charge_id": charge_id,
                                "p_amount": tx.get('amount'),
                                "p_type": "topup",
                                "p_description": f"Omise PromptPay Topup ({charge_id})"
                            })
                else:
                    call_supabase_rest('topup_transactions', method='PATCH', query=f"?omise_charge_id=eq.{charge_id}", body={"status": status})

            return self._send_json(200, {"success": True, "message": "Webhook processed"})

        # 3. POST /api/chat/send
        elif self.path == '/api/chat/send':
            msg_id = f"msg_{int(time.time()*1000)}_{int(time.time())%1000}"
            order_id = body.get('order_id', 'general')
            user_id = body.get('user_id', '')
            username = body.get('username', 'Customer')
            sender_role = body.get('sender_role', 'customer')
            text = body.get('message', '').strip()
            attachment = body.get('attachment', '')
            product_name = body.get('product_name', '')
            delivery_code = body.get('delivery_code', '')

            if not text and not attachment:
                return self._send_json(400, {"success": False, "message": "Message or attachment is required"})

            msg_obj = {
                "id": msg_id,
                "order_id": order_id,
                "user_id": user_id,
                "username": username,
                "sender_role": sender_role,
                "message": text,
                "attachment": attachment,
                "product_name": product_name,
                "delivery_code": delivery_code,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            chats = load_chat_history()
            chats.append(msg_obj)
            save_chat_history(chats)

            return self._send_json(200, {"success": True, "message": msg_obj})

        # 4. POST /api/slip/session/create
        elif self.path == '/api/slip/session/create':
            session_id = f"slip_{int(time.time()*1000)}_{int(time.time())%1000}"
            lan_ip = get_lan_ip()
            upload_url = f"http://{lan_ip}:{PORT}/upload-slip.html?session={session_id}"
            local_url = f"http://127.0.0.1:{PORT}/upload-slip.html?session={session_id}"
            SLIP_SESSIONS[session_id] = {
                "status": "waiting",
                "slip_data": None,
                "filename": None,
                "created_at": time.time()
            }
            return self._send_json(200, {
                "success": True,
                "session_id": session_id,
                "upload_url": upload_url,
                "local_url": local_url,
                "lan_ip": lan_ip,
                "port": PORT
            })

        # 5. POST /api/slip/upload
        elif self.path == '/api/slip/upload':
            session_id = body.get('session_id')
            image_data = body.get('image_data')
            filename = body.get('filename', 'mobile_slip.jpg')
            if not session_id or not image_data:
                return self._send_json(400, {"success": False, "message": "ข้อมูลไม่ครบถ้วน กรุณาระบุ session_id และรูปภาพ"})

            SLIP_SESSIONS[session_id] = {
                "status": "completed",
                "slip_data": image_data,
                "filename": filename,
                "uploaded_at": time.time()
            }
            return self._send_json(200, {
                "success": True,
                "message": "อัพโหลดสลิปเข้าสู่ระบบสำเร็จแล้ว!"
            })

        else:
            return self._send_json(404, {"error": "Endpoint not found"})

    def do_GET(self):
        # 4. GET /api/chat/messages
        if self.path.startswith('/api/chat/messages'):
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            order_id = qs.get('order_id', [None])[0]
            username = qs.get('username', [None])[0]

            chats = load_chat_history()
            if order_id and order_id != 'all':
                chats = [c for c in chats if c.get('order_id') == order_id]
            elif username and username != 'all':
                chats = [c for c in chats if c.get('username', '').lower() == username.lower()]

            return self._send_json(200, {"success": True, "messages": chats})

        # 5. GET /api/chat/threads
        elif self.path == '/api/chat/threads':
            chats = load_chat_history()
            threads = {}
            for c in chats:
                key = c.get('order_id') or c.get('username') or 'general'
                if key not in threads:
                    threads[key] = {
                        "order_id": c.get('order_id'),
                        "username": c.get('username'),
                        "product_name": c.get('product_name'),
                        "delivery_code": c.get('delivery_code'),
                        "last_message": c.get('message') or '[รูปภาพ]',
                        "last_time": c.get('created_at'),
                        "count": 0
                    }
                threads[key]["last_message"] = c.get('message') or '[รูปภาพ]'
                threads[key]["last_time"] = c.get('created_at')
                threads[key]["count"] += 1

            return self._send_json(200, {"success": True, "threads": list(threads.values())})

        # 6. GET /api/topup/status/<charge_id>
        elif self.path.startswith('/api/topup/status/'):
            charge_id = self.path.replace('/api/topup/status/', '').split('?')[0].strip()
            
            # Check DB
            tx = None
            txs = call_supabase_rest('topup_transactions', query=f"?omise_charge_id=eq.{charge_id}")
            if txs and len(txs) > 0:
                tx = txs[0]
            elif charge_id in MEM_TRANSACTIONS:
                tx = MEM_TRANSACTIONS[charge_id]

            if tx:
                balance = 0
                if tx.get('user_id'):
                    profile = call_supabase_rest('profiles', query=f"?id=eq.{tx.get('user_id')}")
                    balance = profile[0].get('balance', 0) if profile and len(profile) > 0 else 0
                return self._send_json(200, {
                    "success": True,
                    "charge_id": tx.get('omise_charge_id'),
                    "status": tx.get('status'),
                    "amount": tx.get('amount'),
                    "balance": balance,
                    "updated_at": tx.get('updated_at', datetime.now(timezone.utc).isoformat())
                })
            return self._send_json(404, {"success": False, "message": "Transaction not found"})

        # 7. GET /api/slip/session/create
        elif self.path.startswith('/api/slip/session/create'):
            session_id = f"slip_{int(time.time()*1000)}_{int(time.time())%1000}"
            lan_ip = get_lan_ip()
            upload_url = f"http://{lan_ip}:{PORT}/upload-slip.html?session={session_id}"
            local_url = f"http://127.0.0.1:{PORT}/upload-slip.html?session={session_id}"
            SLIP_SESSIONS[session_id] = {
                "status": "waiting",
                "slip_data": None,
                "filename": None,
                "created_at": time.time()
            }
            return self._send_json(200, {
                "success": True,
                "session_id": session_id,
                "upload_url": upload_url,
                "local_url": local_url,
                "lan_ip": lan_ip,
                "port": PORT
            })

        # 8. GET /api/slip/check/<session_id>
        elif self.path.startswith('/api/slip/check/'):
            session_id = self.path.replace('/api/slip/check/', '').split('?')[0].strip()
            if session_id in SLIP_SESSIONS:
                sess = SLIP_SESSIONS[session_id]
                return self._send_json(200, {
                    "success": True,
                    "session_id": session_id,
                    "status": sess.get("status"),
                    "slip_data": sess.get("slip_data"),
                    "filename": sess.get("filename")
                })
            return self._send_json(404, {"success": False, "status": "not_found", "message": "Session not found"})

        # 9. GET /api/slip/info
        elif self.path.startswith('/api/slip/info'):
            lan_ip = get_lan_ip()
            return self._send_json(200, {
                "success": True,
                "lan_ip": lan_ip,
                "port": PORT,
                "base_url": f"http://{lan_ip}:{PORT}"
            })

        # 10. Rewrites for /upload-slip to /upload-slip.html
        elif self.path == '/upload-slip' or self.path.startswith('/upload-slip?'):
            self.path = '/upload-slip.html' + (('?' + self.path.split('?', 1)[1]) if '?' in self.path else '')
            return super().do_GET()

        # Static files serving
        return super().do_GET()

if __name__ == '__main__':
    lan_ip = get_lan_ip()
    print("=======================================================")
    print(f"[Little Cloud Shop Server] Running on http://127.0.0.1:{PORT}")
    print(f"[Mobile Slip Upload Access] Network LAN URL: http://{lan_ip}:{PORT}")
    print(f"[Omise PromptPay API] Endpoint: http://127.0.0.1:{PORT}/api/topup/create")
    print(f"[Omise Webhook API] Endpoint: http://127.0.0.1:{PORT}/api/webhook/omise")
    print(f"[Status Polling API] Endpoint: http://127.0.0.1:{PORT}/api/topup/status/<charge_id>")
    print(f"[Mobile Slip Upload API] Endpoint: http://127.0.0.1:{PORT}/api/slip/session/create")
    print("=======================================================")
    server = ThreadingHTTPServer(('0.0.0.0', PORT), LittleCloudHandler)
    server.serve_forever()
