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
// jshint undef:false
oboe = oboe;
// jshint undef:true

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

// Chat player
var Chat = function(options) {
	var self = {};
	self.chatEl = options.chatEl;
	self.scrolledUp = false;
	// private functions
	self._ = {};

	$(self.chatEl.parentElement).scroll(function() {
		var p = self.chatEl.parentElement;
		var pa = p.scrollTop;
		var pb = p.scrollHeight - p.clientHeight;
		var pc = pa/pb;
		if (pc >= 0.99 || pb === 0) {
			self.scrolledUp = false;
		} else {
			self.scrolledUp = true;
		}
	});

	// just adjust time
	self._.skipSeek = function(time) {
		self.startedAt = time;
		self.offset = Date.now() - self.startedAt;
	};

	// get log url of time in millis
	var logUrl = function(time) {
		// pad to length 2
		var p = function(n) {
			return n < 10 ? '0' + n : '' + n;
		};
		var t = new Date(time);
		var d = t.getUTCFullYear() + '-' + p(t.getUTCMonth()+1) + '-' + p(t.getUTCDate()) + '-' + p(t.getUTCHours());
		return 'http://destisenpaii.me/log/chat-' + d + '.log';
	};

	self._.resetDownloadTimeout = function() {
		clearTimeout(self.downloadTimeout);
		self.downloadTimeout = setTimeout(function() {
			if (logUrl(self.then()) === self.logUrl) {
				self._.resetDownloadTimeout();
			} else {
				console.log('log download timed out');
				self._.initStream();
			}
		}, 5000);
	};

	self._.startProcessing = function() {
		if (!self.processing) {
			self.processTimeout = setTimeout(function() {
				self._.process();
			}, 0);
		}
	};

	self._.process = function() {
		if (self.messageQueue.size === 0) {
			self.processing = false;
			return;
		}
		self.processing = true;
		var msg = self.messageQueue.peek();
		var millis = msg.timestamp - self.then();
		if (msg.timestamp < self.lastMessageAt) {
			// this is before the last message, discard
			console.log('skipping message ' + (-millis) + ' millis ago');
		} else {
			if (millis > 0) {
				self.processTimeout = setTimeout(function() {
					self._.process();
				}, millis);
			} else {
				self.messageQueue.dequeue();
				self.onMsg(msg);
				self.processTimeout = setTimeout(function() {
					self._.process();
				}, 0);
			}
		}
	};

	var msgTmpl = doT.template(
		'<span class="nick">{{!it.nick}}:</span> ' +
		'<span class="msg {{=it.classes}}">{{=it.data}}</span>'
	);

	var emotes = [
		'AYYYLMAO', 'Abathur', 'AngelThump', 'BasedGod', 'BibleThump', 'CallCatz', 'CallChad',
		'DAFUK', 'DANKMEMES', 'DURRSTINY', 'DaFeels', 'DappaKappa', 'DatGeoff', 'DestiSenpaii',
		'Disgustiny', 'Dravewin', 'DuckerZ', 'FIDGETLOL', 'FeedNathan', 'FerretLOL', 'FrankerZ',
		'GameOfThrows', 'Heimerdonger', 'Hhhehhehe', 'INFESTINY', 'KINGSLY', 'Kappa', 'Klappa',
		'LUL', 'MotherFuckinGame', 'Nappa', 'NoTears', 'OhKrappa', 'OverRustle', 'SURPRISE',
		'Sippy', 'SoDoge', 'SoSad', 'TooSpicy', 'UWOTM8', 'WORTH', 'WhoahDude'
	];

	var emoteRegex = new RegExp('(?:^| )('+emotes.join('|')+')(?:$| )');

	self.onMsg = function(msg) {
		if (msg.data[0] === '>') {
			msg.classes = 'green-text';
		}
        msg.data = urlize(msg.data, {autoescape: true, target: '_blank', trim: 'http'});
		msg.data = msg.data.replace(emoteRegex,
		'<div title="$1" class="chat-emote chat-emote-$1"></div>');
		self._.printMsg('msg', msgTmpl(msg));
	};

	self._.initStream = function() {
		self.log('initializing stream');
		self.messageQueue = new Queue();
		if (self.oboe) {
			self.oboe.abort();
		}
		self.logUrl = logUrl(self.then());
		self.oboe = oboe(self.logUrl).done(function(msg) {
			self.messageQueue.enqueue(msg);
			self._.startProcessing();
			self._.resetDownloadTimeout();
		}).fail(function(error) {
			console.log(error);
			if (error.statusCode === 0 && error.thrown === undefined) {
				self.log('No logs available');
			} else {
				self.log('Error downloading chat logs');
			}
		});
	};

	// seek to time in past (milliseconds utc)
	self.seek = function(time) {
		console.log('chat seeking to time ' + time);
		var oldThen = self.then();
		self._.skipSeek(time);
		var newThen = self.then();
		if (!oldThen || Math.abs(newThen - oldThen) > 20000) {
			self.clear();
			self.processing = false;
			clearTimeout(self.processTimeout);
			self._.initStream();
		}
	};

	self.play = function() {
		self.pausedAt = undefined;
		self.processing = false;
		self._.startProcessing();
	};

	self.pause = function() {
		self.pausedAt = self.then();
		self.processing = true;
		clearTimeout(self.processTimeout);
	};

	// what time do we think it is (milliseconds utc)
	self.then = function() {
		if (self.pausedAt) {
			return self.pausedAt;
		}
		return Date.now() - self.offset;
	};

	// empty chat
	self.clear = function() {
		self.lastMessageAt = 0;
		self.chatEl.innerHTML = '';
	};

	self.scrollDown = function() {
		var p = self.chatEl.parentElement;
		p.scrollTop = p.scrollHeight;
	};

	self._.printMsg = function(cssClass, html) {
		var m = document.createElement('div');
		m.class = cssClass;
		m.innerHTML = html;
		self.chatEl.appendChild(m);
		if (!self.scrolledUp) {
			self.scrollDown();
			while (self.chatEl.children.length > 300) {
				self.chatEl.firstChild.remove();
			}
		}
	};

	// print status message in chat
	self.log = function(msg) {
		self._.printMsg('msg-log', msg);
	};
	return self;
};

// video player
var Video = function(options) {
	var self = {};

	self.videoEl = options.videoEl;
	self.videoLoaded = false;

	// seek video to time (milliseconds)
	self.seek = function(time) {
		if (self.videoLoaded) {
			self.player.videoSeek((self.startedAt - time) / 1000);
		} else {
			throw 'video not loaded';
		}
	};

	self.seekFromStart = function(seconds) {
		if (self.videoLoaded) {
			self.player.videoSeek(seconds);
		} else {
			throw 'video not loaded';
		}
	};

	self.then = function() {
		if (self.videoLoaded) {
			return self.startedAt + self.player.getVideoTime() * 1000;
		} else {
			throw 'video not loaded';
		}
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
	 '<param name="flashvars" value="archive_id={{= it.archiveId }}&hostname=www.twitch.tv&channel=destiny&auto_play=true&eventsCallback=r.video.playerEvent">' +
	 '</object>');

	self.insert = function() {
		self.videoLoaded = false;
		self.videoEl.innerHTML = videoTmpl({archiveId: self.archiveId});
		self.player = document.getElementById('twitch-embed');
	};

	self.init = function(vstr, callback) {
		var m = vstr.match(/((twitch.tv\/destiny\/)?b\/)?(\d+)/);
		var videoId = '';
		if (m) {
			videoId = 'a'+m[3];
			self.archiveId = m[3];
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
			self.startedAt = new Date(video.recorded_at).getTime();
			// jshint camelcase: true
			document.title = video.title + ' - DestiSenpaii';
			if (callback) {
				callback();
			}
		});
	};

	self.playerEvent = function(events) {
		for (var i = 0; i < events.length; i++) {
			var e = events[i];
			console.log('player event:', e);
			if (e.event === 'videoPlaying') {
				self.videoLoaded = true;
				if (self.onReady) {
					self.onReady();
					self.onReady = null;
				}
			}
		}
	};

	self.ready = function(f) {
		if (self.videoLoaded) {
			f();
		} else {
			self.onReady = f;
		}
	};

	self.log = console.log;
	return self;
};

// various glue
var Rekt = function(options) {
	var self = {};
	self.video = new Video(options.video);
	self.chat = new Chat(options.chat);
	self.playEl = options.playEl;
	self.time = document.getElementById('time');
	self.playEl.firstChild.className = 'glyphicon glyphicon-pause';
	self.offsetAdj = options.offsetAdj;
	if (!self.offsetAdj) {
		self.offsetAdj = 0;
	}
	var timeTmpl = doT.template(
	'<span title="video: {{= it.vstr}}&#13;chat: {{= it.cstr }}">{{= it.cstr }}</span>'
	);
	setInterval(function() {
		var tryy = function(f, def) {
			try {
				return f();
			} catch (e) {
				return def;
			}
		};
		var cthen = self.chat.then();
		var vthen = tryy(self.video.then, 0);
		if (cthen) {
			var cstr = new Date(cthen).toISOString();
			var vstr = new Date(vthen).toISOString();
			self.time.innerHTML = timeTmpl({
				cthen: cthen,
				vthen: vthen,
				cstr: cstr,
				vstr: vstr,
			});
			if (vthen) {
				var nvthen = self.offsetAdj * 1000 + vthen;
				if (Math.abs(cthen - nvthen) > 1000) {
					self.chat.seek(nvthen);
				}
			}
		}
	}, 1000);
	$(self.playEl).click(function() {
		if (Rekt.paused) {
			Rekt.playEl.firstChild.className = 'glyphicon glyphicon-pause';
			Rekt.play();
		} else {
			Rekt.playEl.firstChild.className = 'glyphicon glyphicon-play';
			Rekt.pause();
		}
	});
	return self;
};

var r;

var linkTmpl = doT.template(
	'<div class="preview">' +
		'<a href="{{= it.href }}" class="thumbnail">' +
			'<img src="{{= it.preview }}" title="{{= it.title }}">' +
		'</a>' +
	'</div>'
);


// jshint undef:false
Twitch.init({clientId: '3ccszp1i7lvkkyb4npiizsy3ida8jtt'}, function(error) {
	// jshint undef:true
	if (error !== null) {
		console.log('TWITCH INIT FAILED ', error);
	}
	r = new Rekt({
		chat: {
			chatEl: document.getElementById('msgs')
		},
		video: {
			videoEl: document.getElementById('video')
		},
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
		$('#videoUrl').val('b/'+b);
		r.video.init('b/'+b, function() {
			r.video.insert();
			r.video.ready(function() {
				if (t) {
					var tn = parseDuration(t);
					console.log('seeking ' + tn + ' seconds from start');
					r.video.seekFromStart(tn);
				}
				r.chat.seek(r.video.then());
				$('#timepicker').data('DateTimePicker').setDate(new Date(r.chat.then()));
			});
		});
	} else {
		Twitch.api({method: '/channels/destiny/videos?broadcasts=true&limit=4'}, function(error, videos) {
			if (error) {
				console.log(error);
				return;
			}
			var out = '';
			for (var i = 0; i < videos.videos.length; i++) {
				var v = videos.videos[i];
				out += linkTmpl({
					href: '/?b=' + v._id.substring(1), // aXXXXX -> XXXXX
					preview: v.preview,
					title: v.title
				});
			}
			document.getElementById('links').innerHTML = out;
		});
		$('#videoUrl').keypress(function(e) {
			if (e.keyCode === 13) {
				e.preventDefault();
				r.video.init(this.value, function() {
					window.history.pushState(null, null, '/?b='+r.video.archiveId);
					r.video.insert();
					r.video.ready(function() {
						r.chat.seek(r.video.then());
						$('#timepicker').data('DateTimePicker').setDate(new Date(r.chat.then()));
					});
				});
				return false;
			}
			return true;
		});
	}
});
var tp = $('#timepicker');
tp.datetimepicker();
tp.on('dp.change', function(e) {
	console.log(e);
	console.log(e.date.toDate().getTime());
	r.chat.seek(e.date.toDate().getTime());
});
$('#control-menu-btn').click(function() {
	$('#control-menu').toggle();
});
$('#offset-adj').change(function() {
	r.offsetAdj = this.value * 1;
});
