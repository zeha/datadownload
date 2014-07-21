datadownload
============

Downloader scripts for various data providers


erste-netbanking.js
-------

Downloads OFX data for the last month from ERSTE/Sparkasse netbanking.

Requires **phantomjs**.

Usage:
```
% phantomjs erste-netbanking.js
Usage: erste-netbanking.js <credentials.json> <account_number> <output.ofx>
```

Example:
```
% phantomjs erste-netbanking.js ./creds.json AT002011112345678901 this-month.ofx
(debug output stripped)
Looking for account number AT002011112345678901
Logged in.
Downloading using XHR...
Done, wrote data to this-month.ofx.
```

credentials.json example:
```
{
  "user": "11111111",
  "password": "ZOMGAPASSWORD"
}
```
