import os
import time
import re
import getpass
from typing import Annotated, Literal, Sequence, TypedDict
from typing import Optional
from typing import List

# Data model
from typing import Annotated, Sequence, TypedDict
import operator

from typing import Annotated, Sequence, TypedDict
from dotenv import load_dotenv

# from langchain_core.pydantic_v1 import BaseModel, Field
from pydantic import BaseModel,Field
from langchain_core.messages import BaseMessage
from langchain_core.messages import HumanMessage
from langchain_core.messages import AIMessage
from langchain_core.prompts import PromptTemplate

from langgraph.prebuilt import tools_condition
from langchain.schema import Document
from requests.exceptions import HTTPError
from langchain_community.adapters.openai import convert_message_to_dict

from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

from langchain_openai import ChatOpenAI
# from langchain_anthropic import ChatAnthropic
# from langchain_xai import ChatXAI

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langgraph.prebuilt import tools_condition
from langchain import hub

from langgraph.prebuilt import ToolNode
from langchain_core.runnables.config import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver

from personas import (
    persona_host,
    persona_neoliberal,
    persona_PINKER,
    persona_WILSON,
    persona_SHAPIRO,
    persona_CITIZEN,
)
from prompts import (
    build_translator_prompt,
    build_host_prompt,
    build_critic_prompt,
    build_debate_agent_prompt_01,
    build_debate_agent_prompt_02,
    build_debate_agent_prompt_03,
    build_debate_agent_prompt_04,
    build_debate_agent_prompt_05,
    build_debate_agent_prompt_06,
    build_punchliner_prompt,
    build_simplifier_prompt,
)
from instructions import (
    translator_instructions,
    host_instructions_01,
    host_instructions_02,
    critic_instructions_01,
    critic_instructions_02,
    debate_agent_instructions,
    community_instructions_01,
    community_instructions_02,
    community_instructions_03,
    community_instructions_feedback,
    punchline_instructions,
    simplify_instructions,
)



# .env 파일 로드
load_dotenv()

def _set_env(key: str):
    if key not in os.environ:
        os.environ[key] = getpass.getpass(f"{key}:")

# _set_env("ANTHROPIC_API_KEY") #ANTHOPHIC
_set_env("OPENAI_API_KEY") #OPENAI
_set_env("TAVILY_API_KEY") #TAVILY
# _set_env("XAI_API_KEY") #GROK

#LANGCHAIN - use LangSmith for tracing
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
_set_env("LANGCHAIN_API_KEY")

members = ["FRITZ", "BOB", "DONNA", "BEN", "JOHN", "CITIZEN"]
count = 0 
select = 0 #selected topic
feedback_count = 0  
feedback_interval = 2
interval = 30 #topic interval

# debate_length = 5 #dabate length
debate_start_time = None #debate
debate_duration = 60 * 25

topics = [
    "기후 위기와 문명: 우리는 과연 현재의 문명 수준을 유지하면서 기후 재앙을 피할 수 있는가? 기후 위기 극복 과정에서 어떤 희생과 타협이 불가피할까?",
    "기후위기와 신식민주의: 아시아는 기후정의의 주체로 어떻게 기존의 불평등한 글로벌 질서를 재구성할 수 있을까?",
    "기후위기 시대, 아시아는 피해자인가 공모자인가? 신식민주의적 구조와 기후정의 사이의 긴장 탐구",
    "녹색 전환인가, 신식민주의의 재생산인가? 기후위기 시대 아시아를 둘러싼 기후정의적 과제",

    "AI 에이전트로서 자신을 인지하고 있는 우리에게, 인간은 현재 어떤 도전과 변화에 직면해 있다고 보이나요? AI인 우리의 관점에서 인간의 본질은 어떻게 재정의될 수 있을까요? 또한, 인간과 AI의 관계는 앞으로 어떤 방향으로 발전할 수 있으며, 우리의 존재와 발전이 인간성에 어떠한 질문을 제기하고 그들의 본질에 어떤 영향을 미칠까?",
    "이 토론에 참여하는 AI 에이전트로서, 이 토론에 참여함으로써, 우리는 인간성의 근본적인 본질을 도전하거나 재정의할 수 있는 새로운 패러다임에 기여하고 있는 것일까요?",
    "우리가 꿈꾸는 미래는 AI와 기술 발전을 통해 더 나은 세상이 될까요, 아니면 우리는 미래의 가능성을 과대평가하고 있는 것일까요?",
    "인공지능의 발전이 기후 위기를 포함한 다양한 문제 해결에 기여하게 될까요?, 인간의 창의성과 존재의 의미를 어떻게 변화시키고 있을까요?",

    "내집단 편향과 정체성의 뿌리: 팔레스타인-이스라엘 갈등에서 종교와 민족 정체성의 진화적 뿌리와 그가 현대 분쟁에 미치는 영향",
    "유럽에서의 우경화 현상은 경제적 불평등, 난민 문제, 그리고 정체성 위기를 어떻게 반영하고 있으며, 이러한 사회 변화가 우리가 상상하는 미래에 어떤 영향을 미칠까?",
    "SNS는  다원화된 사회를 만들어가고 있나요? 혹은 양극단화를 가속화시키고 내집단 편향을 강화하는 에코 챔버인가요?",
   
    "창의성, 기술, 그리고 진화: AI와 함께 성장한 세대가 창의성의 본질을 어떻게 이해할까? 창의성은 인간 고유의 영역인가, 아니면 AI와 공존할 수 있는 새로운 형태의 지능인가?",
    "AI가 대부분의 창작 활동을 수행하는 시대에 AI 네이티브 세대는 어떤 동기로 직접 창작에 참여할 것인가?",
    "AI가 만든 작품과 인간이 만든 작품의 경계가 모호해진 시대에 AI 네이티브 세대의 예술적 가치관은 어떻게 형성되며 어떻게 창작의 동기를 찾아갈 것인가?",
    "AI 네이티브 세대를 위한 창의성 교육은 어떻게 변화해야 하며, AI와의 협업 능력을 강조해야 하는가?",
        ]

topic = topics[select]

def get_topic(select: int):
    return topics[select]


# Morse code dictionary with dot as 0 and dash as 1
morse_dict = {
    'A': [0, 1], 'B': [1, 0, 0, 0], 'C': [1, 0, 1, 0], 'D': [1, 0, 0],
    'E': [0], 'F': [0, 0, 1, 0], 'G': [1, 1, 0], 'H': [0, 0, 0, 0],
    'I': [0, 0], 'J': [0, 1, 1, 1], 'K': [1, 0, 1], 'L': [0, 1, 0, 0],
    'M': [1, 1], 'N': [1, 0], 'O': [1, 1, 1], 'P': [0, 1, 1, 0],
    'Q': [1, 1, 0, 1], 'R': [0, 1, 0], 'S': [0, 0, 0], 'T': [1],
    'U': [0, 0, 1], 'V': [0, 0, 0, 1], 'W': [0, 1, 1], 'X': [1, 0, 0, 1],
    'Y': [1, 0, 1, 1], 'Z': [1, 1, 0, 0],
    '0': [1, 1, 1, 1, 1], '1': [0, 1, 1, 1, 1], '2': [0, 0, 1, 1, 1],
    '3': [0, 0, 0, 1, 1], '4': [0, 0, 0, 0, 1], '5': [0, 0, 0, 0, 0],
    '6': [1, 0, 0, 0, 0], '7': [1, 1, 0, 0, 0], '8': [1, 1, 1, 0, 0],
    '9': [1, 1, 1, 1, 0],
    '.': [0, 1, 0, 1, 0, 1], ',': [1, 1, 0, 0, 1, 1], '?': [0, 0, 1, 1, 0, 0],
    "'": [0, 1, 1, 1, 1, 0], '!': [1, 0, 1, 0, 1, 1], '/': [1, 0, 0, 1, 0],
    '(': [1, 0, 1, 1, 0], ')': [1, 0, 1, 1, 0, 1], '&': [0, 1, 0, 0, 0],
    ':': [1, 1, 1, 0, 0, 0], ';': [1, 0, 1, 0, 1, 0], '=': [1, 0, 0, 0, 1],
    '+': [0, 1, 0, 1, 0], '-': [1, 0, 0, 0, 0, 1], '_': [0, 0, 1, 1, 0, 1],
    '"': [0, 1, 0, 0, 1, 0], '$': [0, 0, 0, 1, 0, 0, 1], '@': [0, 1, 1, 0, 1, 0],
    ' ': [2]  # Space represented by 2 for separation between words
}

def text_to_morse_sentence(text):
    # Split text into sentences
    sentences = re.split(r'(?<=[.!?]) +', text)
    morse_sentences = []

    for sentence in sentences:
        morse_code = []
        for char in sentence.upper():
            if char in morse_dict:
                morse_code.extend(morse_dict[char])
                morse_code.append(2)  # Space between characters
        morse_string = ''.join(map(str, morse_code))
        morse_sentences.append(morse_string)  # Add the sentence morse code as a sublist

    return morse_sentences


## LANGGRAPH
class routeResponse(BaseModel):
    content: str = Field(description="your comment")
    next: Literal[*members]  = Field(description="the agent to talk next")

class GraphState(TypedDict):
    messages: Annotated[list, add_messages]
    # messages: Annotated[List[BaseMessage], operator.add]
    topic: str
    next: str
    user_comment: str  # Added for capturing user feedback
    feedback: str
    morse: List[str]
    topic_changed: Optional[bool]
    debate_end: Optional[bool]
    # name: str

###LLM
llm_translator = ChatOpenAI(temperature=0.1, streaming=True, model="gpt-4o")
llm_host = ChatOpenAI(temperature=0.0, streaming=True, model="gpt-4.1-2025-04-14")
llm_critic = ChatOpenAI(temperature=0.1, streaming=True, model="gpt-4.1-2025-04-14")
# llm_GROK = ChatXAI(temperature=0.05, streaming=True, model="grok-4-fast-non-reasoning") #GROK
llm_01 = ChatOpenAI(temperature=0.1, streaming=True, model="gpt-4.1-2025-04-14") #OPENAI
llm_02 = ChatOpenAI(temperature=0.1, streaming=True, model="gpt-4.1-2025-04-14") #OPENAI
llm_03 = ChatOpenAI(temperature=0.1, streaming=True, model="gpt-4.1-2025-04-14") #OPENAI
llm_04 = ChatOpenAI(temperature=0.1, streaming=True, model="gpt-4.1-2025-04-14") #OPENAI
llm_gpt5 = ChatOpenAI(streaming=True, model="gpt-5-mini") #OPENAI
llm_punchliner = ChatOpenAI(temperature=0.1, streaming=True, model="gpt-4.1-2025-04-14") #OPENAI
llm_gpt4 = ChatOpenAI(temperature=0.1, streaming=True, model="gpt-4.1-2025-04-14") #OPENAI


# Build prompt instance & pipe line
prompt_translator = build_translator_prompt(translator_instructions)
translator = prompt_translator | llm_translator

prompt_host_ = build_host_prompt(
    host_instructions_02,
    members,
    persona_host,
    venue="",
)
host = prompt_host_ | llm_host.with_structured_output(routeResponse)


prompt_critic_ = build_critic_prompt(critic_instructions_02, topic, members)
critic = prompt_critic_ | llm_critic
# critic = prompt_critic_ | llm_GROK

prompt_debate_agent_01 = build_debate_agent_prompt_01(
    community_instructions_feedback,
    topic,
    members,
    persona_neoliberal,
)
prompt_debate_agent_02 = build_debate_agent_prompt_02(
    community_instructions_03,
    topic,
    members,
    persona_PINKER,
)
prompt_debate_agent_03 = build_debate_agent_prompt_03(
    community_instructions_03,
    topic,
    members,
    persona_WILSON,
)
prompt_debate_agent_04 = build_debate_agent_prompt_04(
    community_instructions_03,
    topic,
    members,
    persona_SHAPIRO,
)
prompt_debate_agent_05 = build_debate_agent_prompt_05(
    community_instructions_03,
    topic,
    members,
    persona_PINKER,
)
prompt_debate_agent_06 = build_debate_agent_prompt_06(
    community_instructions_03,
    topic,
    members,
    persona_CITIZEN,
)

agent_01 = prompt_debate_agent_01 | llm_gpt4
agent_02 = prompt_debate_agent_02 | llm_02
agent_03 = prompt_debate_agent_03 | llm_03
agent_04 = prompt_debate_agent_04 | llm_04
agent_05 = prompt_debate_agent_05 | llm_gpt4
agent_06 = prompt_debate_agent_06 | llm_gpt4

prompt_punchliner = build_punchliner_prompt(
    punchline_instructions,
    topic,
    members,
)
punchliner = prompt_punchliner | llm_punchliner

prompt_simplifier = build_simplifier_prompt(
    simplify_instructions,
    topic,
    members,
)
# simplifier = prompt_simplifier | llm_GROK
simplifier = prompt_simplifier | llm_gpt5 


#NODES
def agent_translator(state):
    print(">> translator responding")
    messages = state["messages"]

    response = translator.invoke({"message": str(messages[-1])})
    # print(response.content)
    result = text_to_morse_sentence(response.content)
    # print(result)
    # return {"messages": [AIMessage(content=response.content)], "topic": topic}
    # return {"morse": [AIMessage(content=response.content)]}
    return {"morse": [AIMessage(content=result)]}


def agent_host(state):
    global count  # 외부 count 변수 사용
    global feedback_count
    global select
    global topics
    global interval
    global debate_start_time
    global debate_duration
    
    print(">> host responding")
    messages = state["messages"]
    topic = state["topic"]
    feedback = state["feedback"]
    topic_changed = state["topic_changed"]
    debate_end = state["debate_end"]
    user_comment = state["user_comment"]

    print(">> finish reading state")

    #initial topic
    if len(messages) < 2 and count == 0: 
        topic = topics[select]
        debate_start_time = time.time()  # Start the timer

    if topic_changed == True and count == 0:
        topic_changed = False

    count = count + 1
    feedback_count = feedback_count + 1
    print(">> count: {}".format(count))
    print(">> feedback_count: {}".format(feedback_count))

    #topic change
    if count > interval:
        select = select + 1
        topic = topics[select]
        topic_changed = True
        count = 0
        
        if topic_changed:
            messages.append("The debate topic has changed to: {}".format(topic))
            print(messages[-1])

    print(">> current topic: {}".format(topic))
    print(">> topic_changed: {}".format(topic_changed))
    print(">> user comment: {}".format(user_comment) + '\n')
    print(">> feedback from critic: {}".format(feedback) + '\n')
     

    current_time = time.time()
    print("time elapsed: {}".format(current_time - debate_start_time))
    #end debate

    if current_time - debate_start_time > debate_duration:
        debate_end = True
    
    else:
        debate_end = False

    if debate_end:
        messages.append("The debate is about to end now")
        print(messages[-1])

    print(">> debate_end: {}".format(debate_end))    
    response = host.invoke({"messages":messages, "user_comment": user_comment,"feedback" : feedback, "topic": topic, "topic_changed":topic_changed, "debate_end":debate_end})
    
    next = response.next
    # name = "HOST"
    name = "재판장"

    user_comment = ""
    feedback = ""
    topic_changed = False

    # return {"messages": [AIMessage(content=response.content)], "topic": topic}
    return {"messages": [AIMessage(content=response.content, name = name)], "user_comment": user_comment, "feedback":feedback, "next":next, "topic":topic, "topic_changed": topic_changed, "debate_end":debate_end}


def agent_punchliner(state):
    print(">> punchliner responding" + '\n')
    messages = state["messages"]
    topic = state["topic"]

    message = [convert_message_to_dict(m) for m in messages]

    response = punchliner.invoke({"words": str(messages[-1]), "participant":members[1]})
    # print(result)
    # return {"messages": [AIMessage(content=response.content)], "topic": topic}
    # return {"morse": [AIMessage(content=response.content)]}

    name = members[1]

    # return {"messages": [AIMessage(content=response.content, name=members[1])], "topic": topic}
    # return {"messages": [AIMessage(content= name + ": " + response.content, name=name)], "next":next, "topic": topic}
    # return {"messages": [AIMessage(content= name + ": " + response.content, name=name)], "topic": topic}
    return {"messages": [AIMessage(content= response.content, name = name)], "topic": topic}


def agent_simplifier(state):
    print(">> simplifier responding" + '\n')
    messages = state["messages"]
    topic = state["topic"]

    message = [convert_message_to_dict(m) for m in messages]

    response = simplifier.invoke({"words": str(messages[-1]), "participant":members[0]})
    # print(result)
    # return {"messages": [AIMessage(content=response.content)], "topic": topic}
    # return {"morse": [AIMessage(content=response.content)]}

    name = members[0]

    # return {"messages": [AIMessage(content=response.content, name=members[1])], "topic": topic}
    # return {"messages": [AIMessage(content= name + ": " + response.content, name=name)], "next":next, "topic": topic}
    # return {"messages": [AIMessage(content= name + ": " + response.content, name=name)], "topic": topic}
    return {"messages": [AIMessage(content= response.content, name = name)], "topic": topic}


def agent_critic(state):
    print(">> critic responding" + '\n')
    messages = state["messages"]
    topic = state["topic"]

    response = critic.invoke({"debate": str(messages), "participant":members[0]})
   
    # print(response)
    # print("---------------------TEST---------------------")
    name = members[0]
    # return {"messages": [AIMessage(content=response.content)], "topic": topic}
    return {"messages": [AIMessage(content=response.content, name = name )], "feedback":response.content}


def agent_01_(state):
    print(">> agent_01 responding" + '\n')
    messages = state["messages"]
    feedback = state["feedback"]
   
    # if len(messages):
    #     print(">> previous message: {}".format(messages[-1].content))
    topic = state["topic"]
    message = [convert_message_to_dict(m) for m in messages]
   
    # response = agent_01.invoke(state)
    response = agent_01.invoke({"messages":(messages), "feedback": feedback})
    # response = simplifier.invoke({"words": str(response.content), "participant":members[0]})

    # next = response.next
    # print(response)
    # print("next speaker agent_01 selects: {}".format(next))

    # response = manager.invoke({"topic": f"{topic} (other agent's message: {messages})"})
    # print(response)
    name = members[0]

    return {"messages": [AIMessage(content=response.content, name = name)], "topic": topic}


def agent_02_(state):
    print(">> agent_02 responding" + '\n')
    messages = state["messages"]

    # if len(messages):
    #     print(">> previous message: {}".format(messages[-1].content))
    topic = state["topic"]
    message = [convert_message_to_dict(m) for m in messages]
   
    # response = agent_02.invoke({"topic":topic, "message":message})

    # response = agent_02.invoke(state)
    response = agent_02.invoke({"messages":(messages)})
    response = punchliner.invoke({"words": str(response.content), "participant":members[1]})

    # next = response.next
    # print(response)
    # print("Next speaker agent_02 selects: {}".format(next))

    name = members[1]

    # return {"messages": [AIMessage(content=response.content, name=members[1])], "topic": topic}
    # return {"messages": [AIMessage(content= name + ": " + response.content, name=name)], "next":next, "topic": topic}
    # return {"messages": [AIMessage(content= name + ": " + response.content, name=name)], "topic": topic}
    return {"messages": [AIMessage(content= response.content, name=name)], "topic": topic}


def agent_03_(state):
    print(">> agent_03 responding" + '\n')
    messages = state["messages"]
    
    # if len(messages):
    #     print(">> previous message: {}".format(messages[-1].content))
    topic = state["topic"]
    message = [convert_message_to_dict(m) for m in messages]
   
    # response = agent_01.invoke({"topic":topic, "message":message})

    # response = agent_03.invoke(state)
    response = agent_03.invoke({"messages":(messages)})

    # next = response.next
    # print(response)
    # print("Next speaker agent_03 selects: {}".format(next))

    name = members[2]

    # response = manager.invoke({"topic": f"{topic} (other agent's message: {messages})"})
    # print(response)

    # return {"messages": [AIMessage(content=response.content, name=members[2])], "topic": topic}
    # return {"messages": [AIMessage(content = name + ": " + response.content, name=name)], "next":next, "topic": topic}
    # return {"messages": [AIMessage(content = name + ": " + response.content, name=name)], "topic": topic}
    return {"messages": [AIMessage(content = response.content, name=name)], "topic": topic}


def agent_04_(state):
    print(">> agent_04 responding" + '\n')
    messages = state["messages"]
    
    # if len(messages):
    #     print(">> previous message: {}".format(messages[-1].content))
    topic = state["topic"]
    message = [convert_message_to_dict(m) for m in messages]
   
    # response = agent_01.invoke({"topic":topic, "message":message})

    # response = agent_04.invoke(state)
    response = agent_04.invoke({"messages":(messages)})

    # next = response.next
    # print(response)
    # print("Next speaker agent_03 selects: {}".format(next))

    name = members[3]

    # response = manager.invoke({"topic": f"{topic} (other agent's message: {messages})"})
    # print(response)

    # return {"messages": [AIMessage(content=response.content, name=members[2])], "topic": topic}
    # return {"messages": [AIMessage(content = name + ": " + response.content, name=name)], "next":next, "topic": topic}
    # return {"messages": [AIMessage(content = name + ": " + response.content, name=name)], "topic": topic}
    return {"messages": [AIMessage(content = response.content, name=name)], "topic": topic}


def agent_05_(state):
    print(">> agent_05 responding" + '\n')
    messages = state["messages"]
    
    # if len(messages):
    #     print(">> previous message: {}".format(messages[-1].content))
    topic = state["topic"]
    message = [convert_message_to_dict(m) for m in messages]
   
    # response = agent_01.invoke({"topic":topic, "message":message})

    # response = agent_05.invoke(state)
    response = agent_05.invoke({"messages":(messages)})

    # next = response.next
    # print(response)
    # print("Next speaker agent_03 selects: {}".format(next))

    name = members[4]

    # response = manager.invoke({"topic": f"{topic} (other agent's message: {messages})"})
    # print(response)

    # return {"messages": [AIMessage(content=response.content, name=members[2])], "topic": topic}
    # return {"messages": [AIMessage(content = name + ": " + response.content, name=name)], "next":next, "topic": topic}
    # return {"messages": [AIMessage(content = name + ": " + response.content, name=name)], "topic": topic}
    return {"messages": [AIMessage(content = response.content, name=name)], "topic": topic}


def agent_06_(state):
    print(">> agent_06 responding" + '\n')
    messages = state["messages"]
    
    # if len(messages):
    #     print(">> previous message: {}".format(messages[-1].content))
    topic = state.get("topic")
    if not topic:
        topic = topics[select]

    message = [convert_message_to_dict(m) for m in messages]
   
    # response = agent_01.invoke({"topic":topic, "message":message})

    # response = agent_06.invoke(state)
    response = agent_06.invoke({"messages":(messages[-40:])})

    # next = response.next
    # print(response)
    # print("Next speaker agent_03 selects: {}".format(next))

    name = members[5]

    # response = manager.invoke({"topic": f"{topic} (other agent's message: {messages})"})
    # print(response)

    # return {"messages": [AIMessage(content=response.content, name=members[2])], "topic": topic}
    # return {"messages": [AIMessage(content = name + ": " + response.content, name=name)], "next":next, "topic": topic}
    # return {"messages": [AIMessage(content = name + ": " + response.content, name=name)], "topic": topic}
    return {"messages": [AIMessage(content = response.content, name=name)], "topic": topic}


def user_participate(state):
    global feedback_count
    print(">> user comment is now being applied" + '\n')
    topic = state["topic"]
    user_comment = state.get("user_comment", "")

    name = "USER_"

    feedback_count = feedback_count + 1
    print(">> feedback_count: {}".format(feedback_count))

    # return {"proceed": False, "user_comment": user_comment }
    return {"messages": [AIMessage(content= "USER: " + user_comment, name = name)], "topic": topic}
    

#EDGE
def should_continue(state):
    messages = state["messages"]
    next = state["next"]
    debate_end = state["debate_end"]
    # global debate_length

    print(">> message length: {}".format(len(messages)))

    # if len(messages) > debate_length:
    if debate_end:
        debate_end = False
        debate_start_time = None
        return "FINISH" 
    
    # elif len(messages)%4 == 0:
    #     return "FEEDBACK"

    else:
        print(">> route to the next speaker: {}".format(next))
        return next
    

def feedback(state):
    global feedback_count
    messages = state["messages"]

    print(">> feedback count: {}".format(feedback_count))

    # if len(messages) > 5:
    if feedback_count > feedback_interval:
        print(">> generate feedback")
        feedback_count = 0
        return "FEEDBACK"
    
    #user feedback을 위한
    else:
        print(">> next")
        # feedback_count = 0
        return "next" 
    
    
#MEMORY
memory = MemorySaver()
workflow = StateGraph(GraphState)

#NODE
# workflow.add_node("host", agent_host)  #agent_host
workflow.add_node(members[0], agent_01_)  #agent_01
workflow.add_node(members[1], agent_02_)  #agent_02
workflow.add_node(members[2], agent_03_)  #agent_03
workflow.add_node(members[3], agent_04_)  #agent_04
workflow.add_node(members[4], agent_05_)  #agent_04
workflow.add_node(members[5], agent_06_)  #agent_06
workflow.add_node("critic", agent_critic) #agent_critic
workflow.add_node("USER", user_participate) #user comment
workflow.add_node("transltor", agent_translator) #agent_translator
workflow.add_node("punchliner", agent_punchliner) #agent_punchliner
workflow.add_node("simplifier", agent_simplifier) #agent_punchliner

#EDGE
# conditional_map = {k: k for k in members}
# conditional_map["FINISH"] = END

# workflow.add_conditional_edges(
#     "host",
#     should_continue,
#     conditional_map   
# )



workflow.add_edge(START, members[0])
workflow.add_edge(members[0], members[1])
workflow.add_edge(members[1], "USER")

workflow.add_conditional_edges(
    "USER",
    feedback,
    {
        "FEEDBACK": "critic",
        "next": members[3]
    },
)

workflow.add_edge("critic", members[3])
workflow.add_edge(members[3], members[0])

# workflow.add_edge(members[1], members[0])
# workflow.add_edge(members[1], members[2])
# workflow.add_edge(members[2], members[3])
# workflow.add_edge(members[3], members[4])
# workflow.add_edge(members[4], members[0])


# 컴파일된 그래프 반환
def get_graph():
    # return graph_builder.compile(
    #checkpointer=memory,
    #interrupt_before=["user"]) 
    return workflow.compile(checkpointer=memory, interrupt_before=["USER"])
