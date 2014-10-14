'use strict';
var Queue = require('data-structures').Queue;
var Rekt = function(options) {
	var Rekt = {};
	Rekt.chatEl = options.chatEl;
	Rekt.videoEl = options.videoEl;
	Rekt.scrolledUp = false;
	$(Rekt.chatEl).scroll(function() {
		var e = Rekt.chatEl;
		var a = e.scrollTop;
		var b = e.scrollHeight - e.clientHeight;
		var c = a/b;
		if (c === 1) {
			Rekt.scrolledUp = false;
		} else {
			Rekt.scrolledUp = true;
		}
	});
	var logTime = function(t) {
		var p = function(n) {
			return n < 10 ? '0' + n : '' + n;
		};
		return t.getUTCFullYear() + '-' + p(t.getUTCMonth()+1) + '-' + p(t.getUTCDate()) + '-' + p(t.getUTCHours());
	};
	Rekt.start = function() {
		Rekt.messageQueue = new Queue();
		Rekt.processing = false;
		oboe('http://destisenpaii.me/log/chat-'+logTime(Rekt.time)+'.log').done(function(msg) {
			// next object available
			Rekt.messageQueue.enqueue(msg);
			if (!Rekt.processing) {
				Rekt.process();
			}
		}).fail(function(error) {
			console.log('FAIL');
			console.log(error);
		}).on('end', function(things) {
		    // all objects sent
		});
	};
	Rekt.process = function() {
		if (Rekt.messageQueue.size === 0) {
			Rekt.processing = false;
			return;
		}
		Rekt.processing = true;
		var msg = Rekt.messageQueue.dequeue();
		var millis = (msg.timestamp + Rekt.offset) - Date.now();
		if (Math.abs(millis) > 1000 * 60 * 60) {
			console.log("Waiting too long: ", millis);
		}
		if (millis > 0) {
			setTimeout(function() {
				Rekt.onMsg(msg);
				Rekt.process();
			}, millis);
		} else {
			Rekt.onMsg(msg);
			Rekt.process();
		}
	};
	var msgTmpl = doT.template(
		'<span class="nick">{{=it.nick}}:</span> <span class="msg">{{=it.data}}</span>'
	);
	Rekt.onMsg = function(msg) {
		var m = document.createElement('div');
		m.class = 'msg';
		m.innerHTML = msgTmpl(msg);
		Rekt.chatEl.appendChild(m);
		if (!Rekt.scrolledUp) {
			Rekt.chatEl.scrollTop = Rekt.chatEl.scrollHeight;
			while (Rekt.chatEl.children.length > 300) {
				Rekt.chatEl.firstChild.remove();
			}
		}
		Rekt.process();
	};
	Rekt.getStartedAt = function(vstr, callback) {
		var m = vstr.match(/twitch.tv\/destiny\/b\/(\d+)/);
		var videoId = '';
		if (m) {
			videoId = 'a'+m[1];
			Rekt.archiveId = m[1];
		} else {
			m = vstr.match(/(b|c)\d+/);
			if (m) {
				videoId = m[0];
			} else {
				console.log('dont understand ', vstr);
			}
		}
		Twitch.api({method: 'videos/'+videoId}, function(error, video) {
			if (error !== null) {
				console.log(error);
				return;
			}
			// jshint camelcase: false
			Rekt.time = new Date(video.recorded_at);
			Rekt.offset = Date.now() - Rekt.time.getTime();
			// jshint camelcase: true
			callback(Rekt.time);
		});
	};
	var videoTmpl = doT.template(
	 '<object type="application/x-shockwave-flash" data="http://www.twitch.tv/widgets/archive_embed_player.swf" width="100%" height="100%" style="display: block !important;"> <param name="movie" value="http://www.twitch.tv/widgets/archive_embed_player.swf"> <param name="quality" value="high"> <param name="allowFullScreen" value="true"> <param name="allowScriptAccess" value="always"> <param name="pluginspage" value="http://www.macromedia.com/go/getflashplayer"> <param name="autoplay" value="false"> <param name="autostart" value="false"> <param name="flashvars" value="archive_id={{= it.archiveId }}&amp;hostname=www.twitch.tv&amp;start_volume=25&amp;channel=destiny&amp;auto_play=false"> <div style="display: block; cursor: pointer; text-align: center; width: 100%; height: 100%; top: auto; left: auto; position: static;"><div style="-webkit-transition: opacity 150ms ease-out; transition: opacity 150ms ease-out; text-align: left; opacity: 0.25; border: 1px solid rgb(0, 0, 0); width: 100%; height: 100%; background-image: url(chrome-extension://gofhjkjmkpinhpoiabjplobcaignabnl/icon_play.png); background-color: rgba(193, 217, 244, 0.498039); background-repeat: no-repeat;"></div></div><embed src="http://www.twitch.tv/widgets/archive_embed_player.swf" flashvars="archive_id={{= it.archiveId }}&amp;hostname=www.twitch.tv&amp;start_volume=25&amp;channel=destiny&amp;auto_play=false" width="100%" height="100%" type="application/x-shockwave-flash" style="display: none !important;"> </object>');
	Rekt.insertVideo = function() {
		Rekt.videoEl.innerHTML = videoTmpl({archiveId: Rekt.archiveId});
	};
	return Rekt;
};

Twitch.init({clientId: '3ccszp1i7lvkkyb4npiizsy3ida8jtt'}, function(error, status) {
	if (error !== null) {
		console.log('TWITCH INIT FAILED ', error);
	}
	var r = Rekt({
		chatEl: document.getElementById('msgs'),
		videoEl: document.getElementById('video')
	});
	$('#videoUrl').keypress(function(e) {
		e.preventDefault();
		if (e.keyCode === 13) {
			r.getStartedAt(this.value, function() {
				r.start();
				r.insertVideo();
			});
		}
		return false;
	});
});

