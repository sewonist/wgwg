# main.py
import random
import os
import re
import pprint
# from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState  # WebSocketState 임포트

import asyncio
# from agent import get_graph  # 에이전트 가져오기
from agent_multi import get_graph  # 에이전트 가져오기
from agent_multi import get_topic
from langchain_core.runnables.config import RunnableConfig


app = FastAPI()

# 웹소켓 클라이언트 목록
chat_clients = []  # /ws/chat에 연결된 클라이언트 목록
sc_clients = []  # /ws/sc에 연결된 클라이언트 목록

# 정적 파일 경로를 '/static'으로 설정하고, 파일들이 저장된 디렉토리를 지정
# app.mount("/static", StaticFiles(directory="static"), name="static")

# 컴파일된 그래프 가져오기
graph = get_graph()
configurable = {"thread_id": "1"}
config = RunnableConfig(configurable=configurable, recursion_limit=200)
# config = RunnableConfig(recursion_limit=100)

#FOR ASYNC QUEUE
typing_queue: asyncio.Queue = asyncio.Queue()
send_lock = asyncio.Lock()

morse_test = False
morse_idx = 0
user_comment = False
current_topic = None

async def typing_worker():
    while True:
        msg, agent_type = await typing_queue.get()
        try:
            await typing_effect(msg, agent_type)
        except Exception as e:
            print(f">> typing_worker error: {e}", flush=True)
        finally:
            typing_queue.task_done()


@app.on_event("startup")
async def startup_event():
    # 서버 시작 시 워커 실행
    asyncio.create_task(typing_worker())


@app.websocket("/ws/sc")
async def websocket_sc(websocket: WebSocket):
    await websocket.accept()

    # 클라이언트에게 환영 메시지 전송
    welcome_message = {"response": "WebSocket connected!", "agentType": "Server"}
    await websocket.send_json(welcome_message)

    # 클라이언트를 목록에 추가
    sc_clients.append(websocket)
    print(">> sc_clients: ", sc_clients)

    try:
        while True:
            data = await websocket.receive_json()
            print("Data: \n", data)

            # "heartbeat" 메시지인지 확인
            if data.get("heartbeat") == "ping":
                continue  # "heartbeat" 메시지일 경우, 아래의 로직을 건너뜁니다.

            # 수신된 메시지 처리 비동기 작업
            asyncio.create_task(handle_sc_message(data, websocket))

    except WebSocketDisconnect:
        print("WebSocket /ws/sc connection closed")
        sc_clients.remove(websocket)

async def handle_sc_message(data, websocket: WebSocket):
    try:
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.send_json({"response": "Processing your request..."})
    except Exception as e:
        print(f"Error sending /ws/sc message: {e}")


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    global morse_test

    await websocket.accept()
    chat_clients.append(websocket)  # 클라이언트 추가

    try:
        while True:
            data = await websocket.receive_json()
            print(">> Raw Data: ", data)

            # "heartbeat" 메시지인지 확인
            if data.get("heartbeat") == "ping":
                continue  # "heartbeat" 메시지일 경우, 아래의 로직을 건너뜁니다.

            # 버튼이나 슬라이더 메시지 처리
            if data.get("type") in ["Button", "Slider"]:
                print(f"Received {data['type']} event, broadcasting to other clients...")

                # 현재 웹소켓을 제외한 모든 클라이언트에게 브로드캐스트
                await broadcast_to_all_except_sender(websocket, data)
            else:
                # 다른 타입의 메시지도 처리 (예: 모스 코드)
                asyncio.create_task(handle_chat_message(data, websocket))

    except WebSocketDisconnect:
        print(">> WebSocket /ws/chat 연결이 종료되었습니다.")
        chat_clients.remove(websocket)  # 클라이언트 제거


async def typing_effect(full_message: str, agent_type: str):
    try:
        print(">> typing starts: {}".format(agent_type),flush=True)
        partial_message = ""
        # 타이핑 효과를 위해, 실시간으로 클라이언트에게 부분적으로 응답을 전송
        chunk_size = 1  # 한 번에 보낼 글자의 수를 설정, 클수록 출력 빠름

        for i in range(0, len(full_message), chunk_size):
            partial_message += full_message[i:i+chunk_size]
            await broadcast_to_all_chat_clients({"response": partial_message, "agentType": agent_type})
            await asyncio.sleep(0.04)  # 타이핑 딜레이
    except Exception as e:
        print(f">> typing_effect error: {e}", flush=True)       


async def handle_chat_message(data, websocket: WebSocket):
    global morse_idx
    global user_comment
    
    try:
        key = "Bot"
        message = ""  
        # topic = get_topic(0)
        topic = ""

        #user comment를 위한 로직
        #while True:
            # data = await websocket.receive_json()
            #     # "heartbeat" 메시지인지 확인
            #     if data.get("heartbeat") == "ping":
            #         # await websocket.send_json({"response": "pong", "agentType": "heartbeat"})
            #         continue  # "heartbeat" 메시지일 경우, 아래의 로직을 건너뜁니다.

        typing_tasks = []  # 혹시 나중에 gather 하고 싶을 때를 위해 저장
        user_input = data.get("message", "")

        response_message = ""
       
        #user comment를 위한 로직
        if  user_comment is False: #처음
            print(">> 토론 시작")

            inputs = {
            "topic": topic, 
            "messages":message, 
            "feedback": "", 
            "user_comment": user_input, 
            "topic_changed": False, 
            "debate_end":False } 

        else:   #유저 코멘트 
            print(">> 말씀하신 내용을 전달합니다. {}".format(user_input) + '\n')

            graph.update_state(
                        config,
                        # The updated values to provide. The messages in our `State` are "append-only", meaning this will be appended
                        # to the existing state. We will review how to update existing messages in the next section!
                        {"user_comment": user_input},
            )

            inputs = None
    
        next_node = None

        async for output in graph.astream(inputs, config):
        # for output in graph.stream(inputs, config):    
            snapshot = graph.get_state(config)
            next_node = snapshot.next
            
            response_message = ''  #FOR TYPING EFFECT
            response_morse = '' #FOR MORSE CODE

            for key, value in output.items():
                print(f"{key}: {value}")
                if 'messages' in value:
                    for message in value['messages']:
                        response_message = message.content  
                elif 'morse' in value:     
                    for morse in value['morse']:
                        response_morse = morse.content        
            
            #FOR MORSE CODE
            # 0 = Dot, 1 = Dash, 2 = Space
            if response_morse != '':
                morse_idx%=5
                # 리스트의 요소를 연결하고 각 요소 사이에 숫자 3 추가 : 문장 사이를 3으로 표현
                joined_string = '3'.join(response_morse)
                # print("joined_string: ", joined_string)
                for sc_client in sc_clients:
                    try:
                        if sc_client.client_state == WebSocketState.CONNECTED:
                            print("sending from messages...")
                            message = { "type": "MorseCode", "group": 100, "index": morse_idx + 1, "value": joined_string}
                            await sc_client.send_json(message)
                        else:
                            print("Client is not connected.")
                    except Exception as e:
                        print(f"Error sending message: {e}")
                morse_idx+=1 

            #FOR TYPING EFFECT
            if response_message != '':
                print(">> response_messgae is not empty and typing starts", flush=True)

                #NEW
                await typing_queue.put((response_message, key))    
                await asyncio.sleep(0)  # 이벤트 루프에 제어권을 잠깐 넘겨서 task 실행 기회 부여

        pprint.pprint("----------------------END OF GRAPH--------------------------")     

        print(">> key:", key, flush=True)
        user_comment = True
        await broadcast_to_all_chat_clients({"response": "[END]", "agentType": key})
        pprint.pprint("------------------------------------")

    except Exception as e:
        print(f"WebSocket Error: {e}")
        await websocket.close()


async def broadcast_to_all_chat_clients(message: dict):
# def broadcast_to_all_chat_clients(message: dict):
    # print(">> trying lock", flush=True)
    async with send_lock:
        # print(">> broadcasting to clients: ", message, flush=True)  # 로그
        """모든 /ws/chat 클라이언트에게 토론 메시지를 전송합니다."""
        for client in chat_clients:
            try:
                if client.client_state == WebSocketState.CONNECTED:
                    await client.send_json(message)
            except Exception as e:
                print(f"Error sending message to client: {e}", flush=True)
            

async def broadcast_to_all_except_sender(sender: WebSocket, data: dict):
# def broadcast_to_all_except_sender(sender: WebSocket, data: dict):
    
    # Test, Button, Slider 이벤트를 ws/sc로 전달
    msg_type = data.get("type", "")

    if msg_type == "Test":
        print("Test...")
        morse_test = True

        if morse_test == True:
            # /ws/sc에 연결된 모든 클라이언트에게 메시지 전송
            for sc_client in sc_clients:
                try:
                    if sc_client.client_state == WebSocketState.CONNECTED:
                        print("sending from messages...")
                        message = { "type": "MorseCode", "group":data.get("group", 1), "index": data.get("index", 1), "value": "0120123101"}                                
                        await sc_client.send_json(message)
                    else:
                        print("Client is not connected.")
                except Exception as e:
                    print(f"Error sending message: {e}")
            morse_test = False

    elif msg_type == "Button":
        # /ws/sc에 연결된 모든 클라이언트에게 메시지 전송
        print("Button...")
        for sc_client in sc_clients:
            try:
                if sc_client.client_state == WebSocketState.CONNECTED:
                    print("sending from buttons...")
                    await sc_client.send_json(data)
                else:
                    print("Client is not connected.")
            except Exception as e:
                print(f"Error sending message: {e}")

    elif msg_type == "Slider":
        # /ws/sc에 연결된 모든 클라이언트에게 메시지 전송
        print("Slider...")
        for sc_client in sc_clients:
            try:
                if sc_client.client_state == WebSocketState.CONNECTED:
                    print("sending from sliders...")
                    await sc_client.send_json(data)
                else:
                    print("Client is not connected.")
            except Exception as e:
                print(f"Error sending message: {e}")
    
    # 브라우저 UI 동기화를 위해 broadcast
    """보낸 클라이언트를 제외한 모든 /ws/chat 클라이언트에게 메시지 전송."""
    for client in chat_clients:
        if client != sender and client.client_state == WebSocketState.CONNECTED:
            try:
                await client.send_json(data)
            except Exception as e:
                print(f"Error sending message to client: {e}")
                

# FastAPI 실행
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=4001)
