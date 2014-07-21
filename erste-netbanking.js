var page = require('webpage').create();
var fs = require('fs');
var system = require('system');

if (system.args.length !== 4) {
    console.info('Usage: erste-netbanking.js <credentials.json> <account_number> <output.ofx>');
    phantom.exit(1);
}

var credentials;
try {
credentials = JSON.parse(fs.read(system.args[1]));
} catch (e) {
  console.error("Paring credentials file '" + system.args[1] + "' failed: " + e);
  phantom.exit(1);
}
var account_number = system.args[2];
var outputfilename = system.args[3];

console.info("Looking for account number '" + account_number + "'");

window.setTimeout(function() {
  // total timeout: 60sec
  console.error('Timeout');
  phantom.exit(2);
}, 60000);

page.settings.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_4) AppleWebKit/537.77.4 (KHTML, like Gecko) Version/7.0.5 Safari/537.77.4';

var step = 1;
function debugRender() {
  return;
  console.log('render: ' + step);
  page.render('foo_' + step + '.png');
  step = step+1;
};

page.onError = function(msg, trace) {
  console.error(msg);
  trace.forEach(function(item) {
    console.log('  ', item.file, ':', item.line);
  });
}

qS = function(selector) {
  return page.evaluate(function(selector) { return document.querySelector(selector) }, selector);
};

gotoLink = function(selector, finished) {
  var link = qS(selector);
  console.log('Next href: ', link.href);
  link.style.color = 'lime';
  debugRender();
  page.open(link.href, finished);
};

function getDownloadParams(page, event_value) {
  return page.evaluate(function(event_value) {
    var ret = {};
    var form = document.querySelector('form[name=LABEL_NBMAIN_umsatzsuche]');
    document.LABEL_NBMAIN_umsatzsuche.LABEL_NBMAIN_event.value=event_value; document.LABEL_NBMAIN_umsatzsuche.LABEL_NBMAIN_action.value='netbanking.webapp.giro.umsatzsucheNeu';
    form.onsubmit = function() {
      var post = "";
      for (var i = 0; i < form.elements.length; i++) {
        if (form.elements[i].name && form.elements[i].value) {
          if (form.elements[i].type == 'radio' && !form.elements[i].checked) {
            continue;
          }
          if (form.elements[i].type == 'button') {
            continue;
          }
          post = post + "" + form.elements[i].name + "=" + form.elements[i].value + "&";
        }
      }
      ret.action = form.action;
      ret.post = post;
      return false; // abort form submit
    };

    document.querySelector('input[type=submit]').click();
    return ret;
  }, event_value);
}

doneCallback = function(status) {
  console.log('doneCallback -- ', status, ' -> ', page.url);
  debugRender();
};

downloadFinishedCallback = function(status) {
  console.log('downloadFinishedCallback -- ', status, ' -> ', page.url);
  debugRender();

  var download = getDownloadParams(page, 'download');
  // doDownload is called by the page with a delay and triggers the form POST. Let's ignore that.
  page.evaluate(function() {
    doDownload = function() {
      console.log('doDownload() called');
    };
  });
  window.setTimeout(function() {
    // manually run download using XHR, so we can fetch the response data
    console.log('Downloading using XHR...');
    var data = page.evaluate(function(download) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', download.action, false);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
      xhr.send(download.post);
      return xhr.responseText;
    }, download);
    fs.write(outputfilename, data);
    console.info('Done, wrote data to ' + outputfilename + '.');
    phantom.exit(0);
  }, 1000);
};

downloadPageCallback = function(status) {
  console.log('downloadPageCallback -- ', page.url);
  debugRender();
  page.evaluate(function(format) {
    document.querySelector('select[name=LABEL_NBMAIN_suchKriterien]').value=1; // Anzahl an Tagen
    document.querySelector('input[name=LABEL_NBMAIN_tagums]').value=31; // 31 days
    var formatRadio = document.querySelector('input[name=LABEL_NBMAIN_format][value='+format+']');
    formatRadio.checked = true;
    formatChanged();
    selectAll();
  }, 'ofx');

  debugRender();

  var download = getDownloadParams(page, 'preDownload');
  console.log('manually post form: ', download.action, download.post);
  page.open(download.action, 'POST', encodeURI(download.post), downloadFinishedCallback);
};


listPageCallback = function(status) {
  console.log('listPageCallback -- ', page.url);
  debugRender();
  gotoLink('a[id="GIRO_UMSATZ_DOWNLOAD"]', downloadPageCallback);
};

accountPageCallback = function(status) {
  console.log('accountPageCallback -- ', page.url);
  debugRender();
  gotoLink('a[id="GIRO_KONTO_UMSATZSUCHE_ID"]', listPageCallback);
};

tryLoginCallback = function(status) {
  console.log('tryLoginCallback -- ', page.url);
  debugRender();
  if (status !== 'success') {
    console.log('Unable to access network: ', status);
  }
  if (page.url.indexOf('/sPortal/sportal.portal') == -1) {
    return; // not yet logged in
  }
  console.log('Logged in.');
  page.onLoadFinished = null;
  // now logged in
  // find account link and click it
  var link = page.evaluate(function(account_number) {
    var links = document.querySelectorAll('.subnav a');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (link.textContent.trim() == account_number) {
        return link.href;
      }
    }
    return null;
  }, account_number);
  if (link == null) {
    console.error("Account Number not found in navigation list");
    phantom.exit(1);
  }
  console.log('Account page link:', link);
  page.open(link, accountPageCallback);
};

loginCallback = function(status) {
  if (status !== 'success') {
    console.log('open: Unable to access network: ', status);
    phantom.exit(1);
  }
  console.log('loginCallback -- ', page.url);
  page.onLoadFinished = loginCallback;
  debugRender();

  var ret = page.evaluate(function() {
    return document.getElementsByName('anmelden')[0] && document.querySelector('input[type=submit]');
  });
  if (ret == null) {
    // wait for next load event
    return;
  }
  //console.log("*** ret is not null, assuming form is now present: ", ret);

  page.evaluate(function(cred_user, cred_password) {
    var user_id = document.getElementsByName('user_id')[0];
    user_id.focus();
    user_id.value = cred_user;
    user_id.blur();
    var password = document.getElementsByName('password')[0];
    password.focus();
    password.value = cred_password;
    password.blur();
  }, credentials.user, credentials.password);
  debugRender();

  page.onLoadFinished = tryLoginCallback;
  ret = page.evaluate(function() {
    var btn = document.querySelector('input[type=submit]');
    btn.style.color = 'red';
    btn.focus();
    btn.click();
    return btn;
  });
  //console.log(ret);
  //console.log('input name:', ret.name);
  debugRender();
};

page.open('https://netbanking.sparkasse.at/sPortal/s_security_check?layout=netbanking&channel=NB&loginType=0&newPreviewSession=true&desk=sparkasse_de_0198&lang=de', loginCallback);

