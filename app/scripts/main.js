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

// from css-tricks.com
function getQueryVariable(variable) {
	var query = window.location.search.substring(1);
	var vars = query.split('&');
	for (var i=0;i<vars.length;i++) {
		var pair = vars[i].split('=');
		if(pair[0] === variable){return pair[1];}
	}
	return(false);
}

// return number of seconds of XXhXXmXXs format
function parseDuration(str) {
	var m = str.match(/^((\d+)h)?((\d+)m)?((\d+)s)?$/);
	if (!m) {
		return null;
	}
	var seconds = 0;
	if (m[2]) {
		seconds += m[2] * 3600;
	}
	if (m[4]) {
		seconds += m[4] * 60;
	}
	if (m[6]) {
		seconds += m[6] * 1;
	}
	return seconds;
}

var Rekt = function(options) {
	var Rekt = {};
	Rekt.chatEl = options.chatEl;
	Rekt.videoEl = options.videoEl;
	Rekt.playEl = options.playEl;
	Rekt.timeEl = options.timeEl;
	Rekt.scrolledUp = false;
	Rekt.offsetAdj = 0;
	$(Rekt.chatEl.parentElement).scroll(function() {
		var p = Rekt.chatEl.parentElement;
		var pa = p.scrollTop;
		var pb = p.scrollHeight - p.clientHeight;
		var pc = pa/pb;
		if (pc >= 0.99 || pb === 0) {
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
		Rekt.scrolledUp = false;
		Rekt.chatEl.parentElement.scrollTop = Rekt.chatEl.parentElement.scrollHeight;
		Rekt.messageQueue = new Queue();
		Rekt.processing = false;
		Rekt.paused = false;
		Rekt.playEl.firstChild.className = 'glyphicon glyphicon-pause';
		Rekt.lastLogTime = Rekt.time;
		Rekt.download();
		Rekt.updateTime = setInterval(function() {
			Rekt.timeEl.innerHTML = new Date(Rekt.then()).toLocaleString();
		}, 1000);
	};
	Rekt.stop = function() {
		clearTimeout(Rekt.updateTime);
		clearTimeout(Rekt.downloadTimeout);
		clearTimeout(Rekt.nextProcess);
		Rekt.processing = false;
		if (Rekt.oboe) {
			Rekt.oboe.abort();
		}
	};
	Rekt.clear = function() {
		Rekt.chatEl.innerHTML = '';
	};
	Rekt.then = function() {
		return Date.now() - Rekt.offset + Rekt.offsetAdj * 1000;
	};
	Rekt.downloadTimeout = null;
	Rekt.download = function() {
		console.log('starting download');
		// jshint undef:false
		Rekt.oboe = oboe('http://destisenpaii.me/log/chat-'+logTime(Rekt.lastLogTime)+'.log').done(function(msg) {
			// jshint undef:true
			// next object available
			Rekt.messageQueue.enqueue(msg);
			if (!Rekt.processing) {
				Rekt.process();
			}
			clearTimeout(Rekt.downloadTimeout);
			var checkDownload = function() {
				if (logTime(Rekt.lastLogTime) !== logTime(new Date(Rekt.then()))) {
					Rekt.oboe.abort();
					console.log('download finished');
					Rekt.lastLogTime = new Date(Rekt.then());
					Rekt.download();
				} else {
					Rekt.downloadTimeout = setTimeout(checkDownload, 5000);
				}
			};
			Rekt.downloadTimeout = setTimeout(checkDownload, 5000);
		}).fail(function(error) {
			console.log('FAIL');
			console.log(error);
			if (error.statusCode === 0 && error.thrown === undefined) {
				var d = document.createElement('div');
				d.className = 'msg';
				d.innerHTML = 'No Logs Available';
				Rekt.chatEl.appendChild(d);
			}
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
			Rekt.processing = false;
			return;
		}
		if (Rekt.messageQueue.size === 0) {
			Rekt.processing = false;
			return;
		}
		Rekt.processing = true;
		var msg = Rekt.messageQueue.dequeue();
		var millis = msg.timestamp - Rekt.then();
		if (Math.abs(millis) > 1000 * 60 * 60) {
			console.log('Waiting too long: ', millis);
		}
		if (millis > 0) {
			Rekt.nextProcess = setTimeout(function() {
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
			Rekt.chatEl.parentElement.scrollTop = Rekt.chatEl.parentElement.scrollHeight;
			while (Rekt.chatEl.children.length > 300) {
				Rekt.chatEl.firstChild.remove();
			}
		}
		Rekt.process();
	};
	Rekt.getStartedAt = function(vstr, callback) {
		var m = vstr.match(/((twitch.tv\/destiny\/)?b\/)?(\d+)/);
		var videoId = '';
		if (m) {
			videoId = 'a'+m[3];
			Rekt.archiveId = m[3];
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
			Rekt.setTime(new Date(video.recorded_at));
			// jshint camelcase: true
			document.title = video.title + " - DestiSenpaii";
			callback(Rekt.time);
		});
	};
	Rekt.setTime = function (t) {
		Rekt.time = t;
		Rekt.offset = Date.now() - Rekt.time.getTime();
	};
	var videoTmpl = doT.template(
	 '<object id="twitch-embed" type="application/x-shockwave-flash" data="http://www.twitch.tv/widgets/archive_embed_player.swf" width="100%" height="100%" style="display: block !important;">' +
	 '<param name="movie" value="http://www.twitch.tv/widgets/archive_embed_player.swf">' +
	 '<param name="quality" value="best">' +
	 '<param name="allowFullScreen" value="true">' +
	 '<param name="allowScriptAccess" value="always">' +
	 '<param name="pluginspage" value="http://www.macromedia.com/go/getflashplayer">' +
	 '<param name="autoplay" value="false">' +
	 '<param name="autostart" value="false">' +
	 '<param name="flashvars" value="archive_id={{= it.archiveId }}&hostname=www.twitch.tv&channel=destiny&auto_play=true&eventsCallback=r.playerEvent">' +
	 '</object>');
	Rekt.insertVideo = function() {
		Rekt.videoEl.innerHTML = videoTmpl({archiveId: Rekt.archiveId});
		Rekt.player = document.getElementById('twitch-embed');
	};
	Rekt.playerEvent = function(es) {
		for (var i = 0; i < es.length; i++) {
			var e = es[i];
			console.log('player event:', e);
			if (e.event === 'videoLoaded') {
				if (Rekt.seekTo) {
					Rekt.player.videoSeek(Rekt.seekTo);
				}
			}
			if (e.event === 'videoPlaying') {
				Rekt.videoStarted = Date.now();
				setInterval(Rekt.fixSeek, 1000);
			}
		}
	};
	Rekt.fixSeek = function() {
		var supposedVideoTime = Date.now() - Rekt.videoStarted;
		var actualVideoTime = Rekt.player.getVideoTime() * 1000;
		var millisAhead = supposedVideoTime - actualVideoTime;
		if (Math.abs(millisAhead) > 5000 && !Rekt.paused && !Rekt.player.isPaused() && actualVideoTime !== Rekt.lastVideoTime) {
			console.log('Seek of ' + millisAhead / 1000 + ' seconds detected');
			Rekt.stop();
			Rekt.clear();
			Rekt.setTime(new Date(Rekt.time.getTime() - millisAhead));
			Rekt.videoStarted = Date.now() - actualVideoTime;
			Rekt.start();
		}
		Rekt.lastVideoTime = actualVideoTime;
	};
	return Rekt;
};

var r;

// jshint undef:false
Twitch.init({clientId: '3ccszp1i7lvkkyb4npiizsy3ida8jtt'}, function(error) {
	// jshint undef:true
	if (error !== null) {
		console.log('TWITCH INIT FAILED ', error);
	}
	r = new Rekt({
		chatEl: document.getElementById('msgs'),
		videoEl: document.getElementById('video'),
		playEl: document.getElementById('play-btn'),
		timeEl: document.getElementById('time')
	});
	var o = getQueryVariable('o');
	if (o && o.match(/^-?\d+$/)) {
		$('#offset-adj').val(o);
		r.offsetAdj = o * 1;
	}
	var b = getQueryVariable('b');
	if (b && b.match(/^\d+$/)) {
		var t = getQueryVariable('t');
		var tn = 0;
		if (t) {
			tn = parseDuration(t);
			if (tn === null) {
				tn = 0;
			} else {
				console.log('seeking ' + tn + ' seconds ahead');
			}
		}
		$('#videoUrl').val('b/'+b);
		r.getStartedAt('b/'+b, function() {
			r.setTime(new Date(r.time.getTime() + tn*1000));
			r.start();
			r.insertVideo();
			r.seekTo = tn;
			$('#timepicker').data('DateTimePicker').setDate(r.time);
		});
	} else {
		$('#videoUrl').keypress(function(e) {
			if (e.keyCode === 13) {
				e.preventDefault();
				r.getStartedAt(this.value, function() {
					r.start();
					r.insertVideo();
					$('#timepicker').data('DateTimePicker').setDate(r.time);
				});
			}
			return false;
		});
	}
});
var tp = $('#timepicker');
tp.datetimepicker();
tp.on('dp.change', function(e) {
	r.stop();
	r.clear();
	r.setTime(e.date.toDate());
	r.start();
});
$('#control-menu-btn').click(function() {
	$('#control-menu').toggle();
});
$('#offset-adj').change(function() {
	r.offsetAdj = this.value * 1;
});
$('#reload-logs').click(function() {
	r.stop();
	r.clear();
	r.start();
});
