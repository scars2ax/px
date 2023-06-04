""" 
This is a small process running alongside the main NodeJS server intended to
tokenize prompts for Claude, as currently Anthropic only ships a Python
implemetnation for their tokenizer.
ZeroMQ is used for IPC between the NodeJS server and this process.
"""
import zmq
import anthropic

def create_socket():
    context = zmq.Context()
    socket = context.socket(zmq.ROUTER)
    socket.bind("tcp://*:5555")
    return context, socket

def init(socket):
    print("claude-tokenizer.py: starting")
    try:
        while True:
            message = socket.recv_multipart()
            routing_id, command = message
            if command == b"init":
                print("claude-tokenizer.py: initialized")
                socket.send_multipart([routing_id, b"ok"])
                break
    except Exception as e:
        print("claude-tokenizer.py: failed to initialize ({e})")
        return

    message_processor(socket)

def message_processor(socket):
    while True:
        try:
            message = socket.recv_multipart()
            routing_id, command, request_id, payload = message
            payload = payload.decode("utf-8")
            if command == b"exit":
                print("claude-tokenizer.py: exiting")
                break
            elif command == b"tokenize":                
                token_count = anthropic.count_tokens(payload)
                socket.send_multipart([routing_id, request_id, str(token_count).encode("utf-8")])
            else:
                print("claude-tokenizer.py: unknown message type")
        except Exception as e:
            print(f"claude-tokenizer.py: failed to process message ({e})")
            break

if __name__ == "__main__":
    context, socket = create_socket()
    init(socket)
    socket.close()
    context.term()
