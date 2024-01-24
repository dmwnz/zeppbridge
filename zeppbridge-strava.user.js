// ==UserScript==
// @name     zeppbridge-strava
// @version  1
// @grant    none
// @include  https://www.strava.com/upload/select
// ==/UserScript==

window.addEventListener('message', async function(event) {
    console.log(event);
    if(event.data == 'Hello')
        window.opener.postMessage('Hello', 'https://user.huami.com');
    else {
      const authenticity_token=document.querySelector('meta[name=csrf-token]').content;
    //   const file_content=await event.data.text();
      let formData = new FormData();
      formData.append("_method", "post");
      formData.append("authenticity_token", authenticity_token);
      formData.append("files[]", event.data);
      
      const req = await fetch("https://www.strava.com/upload/files", {
        "headers": {
            "X-CSRF-Token": authenticity_token,
        },
        "body": formData,
        "method": "POST",
        });
      console.log(await req.json());
    }
  });