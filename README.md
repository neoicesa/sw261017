# AI사업단 성과관리 대시보드 (Netlify 배포판)

자율성과지표 1차년도(’25) 실적을 보여 주는 성과관리 웹앱입니다. **접속코드·로그인·편집 권한 확인 없이** 주소를 아는 사람은 누구나 보고, 실적을 입력하고, 보고서를 내려받을 수 있습니다.

## 1. 구성

```
├─ site/                     ← 실제 웹페이지(Netlify가 이 폴더를 공개)
│  ├─ index.html             ← 대시보드 화면
│  ├─ data/data.js           ← 성과 자료(엑셀에서 변환)
│  ├─ assets/runtime.js      ← 자료·저장·파일 저장 처리
│  ├─ assets/d3.v7.min.js    ← 그래프 라이브러리(d3 v7.9.0, ISC 라이선스)
│  └─ assets/pretendard-subset.woff2 ← 글꼴(Pretendard 부분 글꼴, SIL OFL 1.1)
├─ netlify/functions/inputs.mjs ← 실적 입력값 공유 저장(Netlify Functions + Netlify Blobs)
├─ tools/build_data.py       ← 엑셀 → site/data/data.js 변환
├─ netlify.toml              ← 배포 설정
└─ package.json              ← 서버 함수용 패키지(@netlify/blobs)
```

## 2. 배포 순서 (GitHub → Netlify)

1. **GitHub 저장소 만들기**
   GitHub에서 New repository를 만들고(Private 권장), 이 폴더의 파일을 모두 올립니다.
   - 웹에서 올릴 때: 저장소 화면 → *Add file → Upload files* → 압축을 푼 폴더 안의 파일·폴더를 끌어다 놓기
   - `node_modules` 폴더는 올리지 않습니다(있다면 제외).
2. **Netlify에서 사이트 만들기**
   Netlify → *Add new site → Import an existing project → GitHub* → 방금 만든 저장소 선택.
3. **빌드 설정 확인**
   `netlify.toml`이 자동으로 적용되므로 그대로 *Deploy*를 누릅니다.
   - Publish directory: `site`
   - Functions directory: `netlify/functions`
4. **확인**
   배포 주소(`https://○○○.netlify.app`)로 접속 → *실적 입력*을 누르면 입력 막대에
   `● 공유 저장소 연결됨`이 보이면 정상입니다.

> 이후에는 GitHub 저장소의 파일을 고치기만 하면 Netlify가 자동으로 다시 배포합니다.
> Netlify Blobs(입력값 저장소)는 별도 설정 없이 자동으로 사용됩니다.

## 3. 기능

| 기능 | 설명 |
|---|---|
| 실적 입력 | 접속코드 없이 누구나 입력. 입력값은 서버(Netlify Blobs)에 저장되고 다른 사용자 화면에는 약 10초 안에 반영 |
| 변경 이력 | 입력자·시각·변경 내용 최근 40건 표시(서버에는 최근 300건 보관) |
| 성과보고서 내보내기 | PDF(인쇄 화면) / Word(.docx) / HTML |
| AI 요약보고서 | 현재 자료를 내장 분석 규칙으로 자동 요약 → 공유(메일·Gmail·Outlook·텍스트 복사), PDF 저장, 출력 |
| 화면 테마 | 남색 화면 / 밝은 화면 |

※ "AI 요약보고서"는 생성형 AI를 호출하지 않고, 페이지에 들어 있는 분석 규칙으로 문장을 만듭니다.

## 4. 자료 바꾸기(새 엑셀 반영)

```bash
pip install openpyxl
python tools/build_data.py "새_엑셀_파일.xlsx"
```
`site/data/data.js`가 새로 만들어집니다. GitHub에 올리면 자동 재배포됩니다.
(엑셀 구조가 2026.10.12. 자료와 같아야 합니다. 대시보드는 1차년도 목표·실적 열을 읽습니다.)

실적 입력값은 엑셀 자료 위에 덮어 계산됩니다. 새 엑셀에 입력값을 반영했다면, 대시보드에서 해당 칸을 비워 원본 값으로 되돌리면 됩니다.

## 5. 내 컴퓨터에서 미리 보기

```bash
cd site
python -m http.server 8000
```
브라우저에서 `http://localhost:8000` 접속. 이때는 서버 함수가 없어 입력값이 **이 브라우저에만** 저장됩니다(입력 막대에 `● 서버 미연결` 표시).
서버 함수까지 시험하려면 Netlify CLI(`npm i -g netlify-cli` → `netlify dev`)를 사용합니다.

## 6. 보안 유의 사항

- 주소를 아는 사람은 누구나 자료를 보고 **실적을 고칠 수 있습니다**(요청에 따라 접속코드·권한 확인을 두지 않음).
- 검색엔진 노출은 막아 두었습니다(`robots.txt`, `X-Robots-Tag: noindex`). 주소는 필요한 분께만 공유하십시오.
- 접근을 제한해야 할 경우: Netlify의 사이트 비밀번호 보호 기능(요금제에 따라 제공) 또는 접속코드 기능을 다시 추가하는 방법이 있습니다.
- 입력값을 모두 지우려면: Netlify 관리 화면의 Blobs 메뉴에서 `ai-dashboard` 저장소의 항목을 지우거나, Netlify CLI의 `netlify blobs:list ai-dashboard` / `netlify blobs:delete ai-dashboard <키>`를 사용합니다. 대시보드에서 입력 칸을 비우는 방법으로도 원본 값으로 되돌릴 수 있습니다.

## 7. 라이선스

- 글꼴: Pretendard (Copyright © 2021 Kil Hyung-jin), SIL Open Font License 1.1 — `site/assets/Pretendard-OFL.txt`. 이 사이트에는 부분 글꼴을 "AI Dash Sans"라는 이름으로 넣었습니다.
- d3 v7.9.0: ISC License — `site/assets/d3-LICENSE.txt`
