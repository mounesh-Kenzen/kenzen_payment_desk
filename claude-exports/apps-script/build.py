"""Builds dist/ (the four files pasted into Apps Script) from src/. Run: python3 build.py"""
import re, json, os
here=os.path.dirname(os.path.abspath(__file__)); src=lambda f: open(os.path.join(here,"src",f),encoding="utf8").read()
head=src("page-head.html")
head=re.sub(r'<title>.*?</title>\n','',head); head=re.sub(r'<meta name="claude:viewport-fit-sides"[^>]*>\n','',head)
head=head.replace('>Download Excel log<','>Save Excel log to Drive<')
shared, client, code = src("shared.js"), src("client.js"), src("Code.js")
pos=head.index('</style>')+len('</style>')
index='<!DOCTYPE html>\n<html>\n<head>\n<base target="_top">\n'+head[:pos]+'\n</head>\n<body>\n'+head[pos:]+'\n<script>\n'+shared+'\n'+client+'\n</script>\n</body>\n</html>\n'
out=os.path.join(here,"dist"); os.makedirs(out,exist_ok=True)
open(os.path.join(out,"Index.html"),"w",encoding="utf8").write(index)
open(os.path.join(out,"Shared.gs"),"w",encoding="utf8").write(shared)
open(os.path.join(out,"Code.gs"),"w",encoding="utf8").write(code)
manifest={"timeZone":"Asia/Kolkata","runtimeVersion":"V8","exceptionLogging":"STACKDRIVER",
 "webapp":{"executeAs":"USER_DEPLOYING","access":"DOMAIN"},
 "oauthScopes":["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/drive","https://www.googleapis.com/auth/script.external_request","https://www.googleapis.com/auth/userinfo.email","https://www.googleapis.com/auth/script.scriptapp"]}
open(os.path.join(out,"appsscript.json"),"w").write(json.dumps(manifest,indent=2))
# combined files for `node --check`
open(os.path.join(here,"test","_server_bundle.js"),"w",encoding="utf8").write(shared+"\n"+code)
open(os.path.join(here,"test","_client_bundle.js"),"w",encoding="utf8").write(shared+"\n"+client)
print("Built dist/")
