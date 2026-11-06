# Overall

Discovers vLLM endpoints on local machine
Speaks with container over gRPC 
Sources vLLM metrics via Prometheus 
Sends them to external API

## Access Points 

- Local Docker Container 
    - iGPU 
    - NPU 
    - CPU 
    - GPU
- Colab (Testing)
    - via Ngrok 

## Design 

- The method of serving vLLM metrics has no impact on how the agent calls the server 
- Beyond local testing, agents should have the option to be deployed via docker or kubernetes, 
this makes it modular. 




