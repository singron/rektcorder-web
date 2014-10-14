/* rektcorder-web is a frontend for rektcorder
 * Copyright (C) 2014 Eric Culp 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General
 * Public License * along with this program.  If not, see
 * <http://www.gnu.org/licenses/>.
 */
'use strict';
var Queue = require('data-structures').Queue;
var Rekt = function(options) {
	var Rekt = {};
	Rekt.chatEl = options.chatEl;
	Rekt.videoEl = options.videoEl;
	Rekt.playEl = options.playEl;
	Rekt.timeEl = options.timeEl;
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
	$(Rekt.playEl).click(function() {
		if (Rekt.paused) {
			Rekt.playEl.firstChild.className = 'glyphicon glyphicon-pause';
			Rekt.play();
		} else {
			Rekt.playEl.firstChild.className = 'glyphicon glyphicon-play';
			Rekt.pause();
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
		Rekt.paused = false;
		Rekt.playEl.firstChild.className = 'glyphicon glyphicon-pause';
		Rekt.lastLogTime = Rekt.time;
		Rekt.download();
		setInterval(function() {
			Rekt.timeEl.innerHTML = new Date(Rekt.then()).toLocaleString();
		}, 1000);
	};
	Rekt.then = function() {
		return Date.now() - Rekt.offset;
	};
	Rekt.download = function() {
		// jshint undef:false
		oboe('http://destisenpaii.me/log/chat-'+logTime(Rekt.time)+'.log').done(function(msg) {
		// jshint undef:true
			// next object available
			Rekt.messageQueue.enqueue(msg);
			if (!Rekt.processing) {
				Rekt.process();
			}
		}).fail(function(error) {
			console.log('FAIL');
			console.log(error);
			if (error.statusCode === 0 && error.thrown === undefined) {
				var d = document.createElement('div');
				d.className = 'msg';
				d.innerHTML = 'No Logs Available';
				Rekt.chatEl.appendChild(d);
			}
		}).on('end', function() {
		    // all objects sent
			// get next hour
			Rekt.lastLogTime += 1000 * 60 * 60;
			Rekt.download();
		});
	};
	Rekt.pause = function() {
		Rekt.paused = true;
		Rekt.pausedAt = Date.now();
	};
	Rekt.play = function() {
		Rekt.paused = false;
		Rekt.offset += Date.now() - Rekt.pausedAt;
		if (!Rekt.processing) {
			Rekt.process();
		}
	};
	Rekt.process = function() {
		if (Rekt.paused) {
			console.log('skipping paused');
			Rekt.processing = false;
			return;
		}
		if (Rekt.messageQueue.size === 0) {
			Rekt.processing = false;
			return;
		}
		Rekt.processing = true;
		var msg = Rekt.messageQueue.dequeue();
		var millis = (msg.timestamp + Rekt.offset) - Date.now();
		if (Math.abs(millis) > 1000 * 60 * 60) {
			console.log('Waiting too long: ', millis);
		}
		if (millis > 0) {
			setTimeout(function() {
				Rekt.onMsg(msg);
			}, millis);
		} else {
			Rekt.onMsg(msg);
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

// jshint undef:false
Twitch.init({clientId: '3ccszp1i7lvkkyb4npiizsy3ida8jtt'}, function(error) {
	// jshint undef:true
	if (error !== null) {
		console.log('TWITCH INIT FAILED ', error);
	}
	var r = new Rekt({
		chatEl: document.getElementById('msgs'),
		videoEl: document.getElementById('video'),
		playEl: document.getElementById('play-btn'),
		timeEl: document.getElementById('time')
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

