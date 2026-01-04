import os
import asyncio
import discord
from discord import app_commands
from discord.ext import commands
import yt_dlp as youtube_dl
from async_timeout import timeout
from functools import partial
from youtube_search import YoutubeSearch
import logging
from dotenv import load_dotenv
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import json
from pathlib import Path
import shutil

# Configurar logging
logging.basicConfig(level=logging.INFO)

# Cargar variables de entorno
load_dotenv()

# Cargar variables de entorno
load_dotenv()

# Agregar FFmpeg al PATH del proceso directamente
def add_ffmpeg_to_path():
    """Agrega FFmpeg al PATH del proceso de Python"""
    ffmpeg_bin = r"C:\Program Files\Path\ffmpeg essentials\bin"
    
    if os.path.exists(ffmpeg_bin):
        # Agregar al inicio del PATH para que tenga prioridad
        current_path = os.environ.get('PATH', '')
        if ffmpeg_bin not in current_path:
            os.environ['PATH'] = ffmpeg_bin + os.pathsep + current_path
            logging.info(f"✅ FFmpeg agregado al PATH del proceso: {ffmpeg_bin}")
        return True
    else:
        logging.error(f"❌ No se encontró FFmpeg en: {ffmpeg_bin}")
        return False

# Agregar FFmpeg al PATH antes de buscarlo
add_ffmpeg_to_path()

# Verificar si FFmpeg está disponible
def find_ffmpeg():
    """Encuentra FFmpeg usando el PATH del sistema"""
    # Intentar encontrar FFmpeg en el PATH
    ffmpeg_path = shutil.which('ffmpeg')
    if ffmpeg_path:
        logging.info(f"✅ FFmpeg encontrado en PATH: {ffmpeg_path}")
        return ffmpeg_path
    
    logging.error("❌ FFmpeg no encontrado en PATH.")
    return None

# Configurar FFmpeg
FFMPEG_PATH = find_ffmpeg()
if FFMPEG_PATH:
    try:
        discord.opus.load_opus('opus')
    except:
        pass

# Opciones de youtube_dl
# NO sobrescribir bug_reports_message - comentar esta línea
# youtube_dl.utils.bug_reports_message = lambda: ''

ytdl_format_options = {
    'format': 'bestaudio/best',
    'outtmpl': '%(extractor)s-%(id)s-%(title)s.%(ext)s',
    'restrictfilenames': True,
    'noplaylist': True,
    'nocheckcertificate': True,
    'ignoreerrors': False,
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'auto',
    'source_address': '0.0.0.0',
    'cookiefile': 'cookies.txt'
}

ffmpeg_options = {
    'options': '-vn',
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5'
}

# FFmpeg se usará automáticamente desde el PATH
# No es necesario especificar executable si está en el PATH
if FFMPEG_PATH:
    logging.info(f"✅ FFmpeg listo para usar")
else:
    logging.error("❌ FFmpeg no disponible. El bot de música no funcionará correctamente.")
    logging.error("   Solución: Agrega FFmpeg al PATH del sistema y reinicia el bot")

ytdl = youtube_dl.YoutubeDL(ytdl_format_options)

# Configurar autenticación de Spotify
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
    spotify = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET
    ))
else:
    spotify = None
    logging.warning("Spotify credentials not found. Spotify link support disabled.")

# Cargar URLs de respaldo desde miku.json
BACKUP_URLS_PATH = Path(__file__).parent / "miku.json"
try:
    with open(BACKUP_URLS_PATH, "r") as f:
        backup_urls = json.load(f).get("youtubeLinks", [])
except FileNotFoundError:
    backup_urls = []
    logging.warning("miku.json not found. Backup URLs disabled.")

class YTDLSource(discord.PCMVolumeTransformer):
    def __init__(self, source, *, data, volume=0.5):
        super().__init__(source, volume)
        self.data = data
        self.title = data.get('title')
        self.url = data.get('url')

    @classmethod
    async def from_url(cls, url, *, loop=None, stream=False):
        loop = loop or asyncio.get_event_loop()
        try:
            data = await loop.run_in_executor(
                None, 
                lambda: ytdl.extract_info(url, download=not stream)
            )
        except Exception as e:
            logging.error(f"Error extracting info from {url}: {e}")
            raise
        
        if 'entries' in data:
            data = data['entries'][0]
            
        filename = data['url'] if stream else ytdl.prepare_filename(data)
        
        # Usar FFmpeg con las opciones configuradas
        audio_source = discord.FFmpegPCMAudio(filename, **ffmpeg_options)
        return cls(audio_source, data=data)

    @classmethod
    async def search_source(cls, search: str, *, loop=None, bot):
        loop = loop or asyncio.get_event_loop()
        
        try:
            to_run = partial(YoutubeSearch, search, max_results=10)
            data = await loop.run_in_executor(None, to_run)
            results = data.to_dict()
            return results
        except Exception as e:
            logging.error(f"Error searching for {search}: {e}")
            return []

class MusicPlayer:
    def __init__(self, ctx):
        self.bot = ctx.bot
        self.guild = ctx.guild
        self.channel = ctx.channel
        self.cog = ctx.bot.get_cog('Music')
        
        self.queue = asyncio.Queue()
        self.next = asyncio.Event()
        
        self.np = None
        self.volume = 0.5
        self.current = None
        
        ctx.bot.loop.create_task(self.player_loop())
        
    async def player_loop(self):
        await self.bot.wait_until_ready()

        while not self.bot.is_closed():
            self.next.clear()

            try:
                # Esperar 3 segundos por una canción de la cola
                async with timeout(3):
                    source = await self.queue.get()
            except asyncio.TimeoutError:
                # Si la cola está vacía después del timeout, usar una URL de respaldo
                if backup_urls:
                    import random
                    backup_song = random.choice(backup_urls)
                    source = backup_song["url"]
                    await self.channel.send(f"**🎵 Reproduciendo desde respaldo:** {backup_song['title']}")
                else:
                    # Si no hay respaldos, esperar indefinidamente
                    source = await self.queue.get()
            except asyncio.CancelledError:
                break

            try:
                if not isinstance(source, YTDLSource):
                    source = await YTDLSource.from_url(source, loop=self.bot.loop, stream=True)

                source.volume = self.volume
                self.current = source

                self.guild.voice_client.play(
                    source, 
                    after=lambda _: self.bot.loop.call_soon_threadsafe(self.next.set)
                )
                self.np = await self.channel.send(f'**▶️ Reproduciendo:** `{source.title}`')

                await self.next.wait()

                source.cleanup()
                self.current = None
            except Exception as e:
                logging.error(f"Error in player loop: {e}")
                await self.channel.send(f"⚠️ Error reproduciendo: {e}")
                continue
            
    def destroy(self, guild):
        if self.cog:
            return self.bot.loop.create_task(self.cog.cleanup(guild))

class Music(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.players = {}
        
    async def cleanup(self, guild):
        try:
            await guild.voice_client.disconnect()
        except AttributeError:
            pass
            
        try:
            del self.players[guild.id]
        except KeyError:
            pass
            
    async def __local_check(self, ctx):
        if not ctx.guild:
            await ctx.send('No puedo ejecutar este comando en DMs.')
            return False
            
        return True
        
    def get_player(self, ctx):
        try:
            player = self.players[ctx.guild.id]
        except KeyError:
            player = MusicPlayer(ctx)
            self.players[ctx.guild.id] = player
            
        return player
    
    def get_player_by_guild(self, guild):
        return self.players.get(guild.id)
        
    @commands.command(name='join', help='Conecta el bot al canal de voz')
    async def join(self, ctx):
        if ctx.author.voice is None:
            return await ctx.send("❌ No estás conectado a un canal de voz.")
            
        if ctx.voice_client is not None:
            await ctx.voice_client.move_to(ctx.author.voice.channel)
            return await ctx.send(f"🔊 Movido a **{ctx.author.voice.channel.name}**!")
            
        await ctx.author.voice.channel.connect()
        await ctx.send(f"✅ Conectado a **{ctx.author.voice.channel.name}**!")
        
    @commands.command(name='play', help='Reproduce una canción (nombre o URL)')
    async def play(self, ctx, *, search: str = None):
        # Manejar el caso de comando sin argumentos
        if search is None:
            return await ctx.send("❌ Debes especificar una canción o URL.\nEjemplo: `!play nombre de la canción`")
        
        if ctx.voice_client is None:
            if ctx.author.voice:
                await ctx.author.voice.channel.connect()
            else:
                return await ctx.send("❌ No estás conectado a un canal de voz.")

        async with ctx.typing():
            player = self.get_player(ctx)

            # Detectar si es un enlace de Spotify
            if spotify and "open.spotify.com" in search:
                try:
                    track = spotify.track(search)
                    search = track['name'] + " " + track['artists'][0]['name']
                    await ctx.send(f"🎵 Buscando en YouTube: **{search}**")
                except Exception as e:
                    return await ctx.send(f"❌ Error al procesar el enlace de Spotify: {e}")

            # Buscar la canción en YouTube
            if not search.startswith(('https://', 'http://')):
                results = await YTDLSource.search_source(search, loop=self.bot.loop, bot=self.bot)
                if not results:
                    return await ctx.send("❌ No se encontraron resultados.")

                first_result = results[0]
                search = f"https://www.youtube.com{first_result['url_suffix']}"
                song_title = first_result.get('title', 'Canción desconocida')
            else:
                song_title = search

            # Añadir a la cola
            await ctx.send(f"➕ **Añadido a la cola:** {song_title}")
            await player.queue.put(search)
        
    @commands.command(name='pause', help='Pausa la canción actual')
    async def pause(self, ctx):
        if ctx.voice_client and ctx.voice_client.is_playing():
            ctx.voice_client.pause()
            await ctx.send("⏸️ **Pausado**")
        else:
            await ctx.send("❌ No hay nada reproduciéndose actualmente.")
            
    @commands.command(name='resume', help='Reanuda la canción pausada')
    async def resume(self, ctx):
        if ctx.voice_client and ctx.voice_client.is_paused():
            ctx.voice_client.resume()
            await ctx.send("▶️ **Reproduciendo**")
        else:
            await ctx.send("❌ La reproducción no está pausada.")
            
    @commands.command(name='skip', help='Salta a la siguiente canción')
    async def skip(self, ctx):
        if ctx.voice_client and (ctx.voice_client.is_playing() or ctx.voice_client.is_paused()):
            ctx.voice_client.stop()
            await ctx.send("⏭️ **Canción saltada**")
        else:
            await ctx.send("❌ No hay nada reproduciéndose actualmente.")
            
    @commands.command(name='queue', help='Muestra la cola de reproducción')
    async def queue_info(self, ctx):
        player = self.get_player(ctx)
        
        if player.queue.empty():
            return await ctx.send('📭 No hay canciones en la cola.')
            
        upcoming = list(player.queue._queue)
        fmt = '\n'.join(f'`{i+1}.` **{url}**' for i, url in enumerate(upcoming[:10]))
        
        if len(upcoming) > 10:
            fmt += f'\n\n*... y {len(upcoming) - 10} más*'
        
        embed = discord.Embed(
            title=f'🎵 Cola de Reproducción',
            description=fmt,
            color=discord.Color.blue()
        )
        embed.set_footer(text=f'Total: {len(upcoming)} canciones')
        
        await ctx.send(embed=embed)
        
    @commands.command(name='now', help='Muestra la canción actual')
    async def now_playing(self, ctx):
        player = self.get_player(ctx)
        
        if not player.current:
            return await ctx.send('❌ No hay nada reproduciéndose actualmente.')
        
        embed = discord.Embed(
            title='🎵 Reproduciendo Ahora',
            description=f'**{player.current.title}**',
            color=discord.Color.green()
        )
        embed.add_field(name='Volumen', value=f'{int(player.volume * 100)}%')
        
        await ctx.send(embed=embed)
        
    @commands.command(name='volume', help='Cambia el volumen (0-100)')
    async def change_volume(self, ctx, vol: int = None):
        if vol is None:
            return await ctx.send("❌ Debes especificar un volumen.\nEjemplo: `!volume 50`")
        
        if ctx.voice_client is None:
            return await ctx.send("❌ No estoy conectado a un canal de voz.")
            
        if not 0 <= vol <= 100:
            return await ctx.send("❌ El volumen debe estar entre 0 y 100.")
            
        player = self.get_player(ctx)
        
        if ctx.voice_client.source:
            ctx.voice_client.source.volume = vol / 100
            
        player.volume = vol / 100
        await ctx.send(f"🔊 Volumen cambiado a **{vol}%**")
        
    @commands.command(name='stop', help='Detiene la música y limpia la cola')
    async def stop(self, ctx):
        if ctx.voice_client:
            await self.cleanup(ctx.guild)
            await ctx.send("⏹️ **Música detenida y cola limpiada.**")
        else:
            await ctx.send("❌ No estoy conectado a un canal de voz.")
            
    @commands.command(name='leave', help='Desconecta el bot del canal de voz')
    async def leave(self, ctx):
        if ctx.voice_client:
            await self.cleanup(ctx.guild)
            await ctx.send("👋 **Desconectado del canal de voz.**")
        else:
            await ctx.send("❌ No estoy conectado a un canal de voz.")
    
    @commands.command(name='ffmpeg', help='Verifica el estado de FFmpeg')
    async def check_ffmpeg(self, ctx):
        """Comando para verificar si FFmpeg está disponible"""
        ffmpeg_path = shutil.which('ffmpeg')
        
        embed = discord.Embed(title="🔧 Estado de FFmpeg", color=discord.Color.blue())
        
        if ffmpeg_path:
            embed.add_field(name="Estado", value="✅ Encontrado", inline=False)
            embed.add_field(name="Ruta", value=f"`{ffmpeg_path}`", inline=False)
        elif FFMPEG_PATH:
            embed.add_field(name="Estado", value="✅ Encontrado (ruta personalizada)", inline=False)
            embed.add_field(name="Ruta", value=f"`{FFMPEG_PATH}`", inline=False)
        else:
            embed.add_field(name="Estado", value="❌ No encontrado", inline=False)
            embed.add_field(
                name="Solución", 
                value="1. Descarga FFmpeg de https://ffmpeg.org/download.html\n"
                      "2. Agrégalo al PATH del sistema\n"
                      "3. Reinicia el bot",
                inline=False
            )
        
        await ctx.send(embed=embed)

# Configuración de comandos de barra (slash commands)
async def setup_slash_commands(bot):
    @bot.tree.command(name="play", description="Reproduce una canción")
    @app_commands.describe(busqueda="La canción que deseas reproducir")
    async def slash_play(interaction: discord.Interaction, busqueda: str):
        await interaction.response.defer()
        
        if not interaction.user.voice:
            return await interaction.followup.send("❌ No estás conectado a un canal de voz.")
        
        if interaction.guild.voice_client is None:
            await interaction.user.voice.channel.connect()
        
        music_cog = bot.get_cog('Music')
        if not music_cog:
            return await interaction.followup.send("⚠️ Error: No se pudo cargar el sistema de música.")
        
        class MockContext:
            def __init__(self, interaction):
                self.bot = interaction.client
                self.guild = interaction.guild
                self.channel = interaction.channel
                self.author = interaction.user
                self.voice_client = interaction.guild.voice_client
        
        mock_ctx = MockContext(interaction)
        player = music_cog.get_player(mock_ctx)
        
        search = busqueda
        if spotify and "open.spotify.com" in search:
            try:
                track = spotify.track(search)
                search = track['name'] + " " + track['artists'][0]['name']
                await interaction.followup.send(f"🎵 Buscando en YouTube: **{search}**")
            except Exception as e:
                return await interaction.followup.send(f"❌ Error al procesar el enlace de Spotify: {e}")
        
        if not search.startswith(('https://', 'http://')):
            results = await YTDLSource.search_source(search, loop=bot.loop, bot=bot)
            if not results:
                return await interaction.followup.send("❌ No se encontraron resultados.")
            
            first_result = results[0]
            search = f"https://www.youtube.com{first_result['url_suffix']}"
            song_title = first_result.get('title', 'Canción desconocida')
        else:
            song_title = search
        
        await interaction.followup.send(f"➕ **Añadido a la cola:** {song_title}")
        await player.queue.put(search)
    
    @bot.tree.command(name="skip", description="Salta a la siguiente canción")
    async def slash_skip(interaction: discord.Interaction):
        if interaction.guild.voice_client and (interaction.guild.voice_client.is_playing() or interaction.guild.voice_client.is_paused()):
            interaction.guild.voice_client.stop()
            await interaction.response.send_message("⏭️ **Canción saltada**")
        else:
            await interaction.response.send_message("❌ No hay nada reproduciéndose actualmente.")
    
    @bot.tree.command(name="queue", description="Muestra la cola de reproducción")
    async def slash_queue(interaction: discord.Interaction):
        music_cog = bot.get_cog('Music')
        player = music_cog.get_player_by_guild(interaction.guild)
        
        if not player or player.queue.empty():
            return await interaction.response.send_message('📭 No hay canciones en la cola.')
        
        upcoming = list(player.queue._queue)
        fmt = '\n'.join(f'`{i+1}.` **{url}**' for i, url in enumerate(upcoming[:10]))
        
        if len(upcoming) > 10:
            fmt += f'\n\n*... y {len(upcoming) - 10} más*'
        
        embed = discord.Embed(
            title=f'🎵 Cola de Reproducción',
            description=fmt,
            color=discord.Color.blue()
        )
        embed.set_footer(text=f'Total: {len(upcoming)} canciones')
        
        await interaction.response.send_message(embed=embed)
    
    @bot.tree.command(name="now", description="Muestra la canción actual")
    async def slash_now(interaction: discord.Interaction):
        music_cog = bot.get_cog('Music')
        player = music_cog.get_player_by_guild(interaction.guild)
        
        if not player or not player.current:
            return await interaction.response.send_message('❌ No hay nada reproduciéndose actualmente.')
        
        embed = discord.Embed(
            title='🎵 Reproduciendo Ahora',
            description=f'**{player.current.title}**',
            color=discord.Color.green()
        )
        embed.add_field(name='Volumen', value=f'{int(player.volume * 100)}%')
        
        await interaction.response.send_message(embed=embed)
    
    @bot.tree.command(name="pause", description="Pausa la canción actual")
    async def slash_pause(interaction: discord.Interaction):
        if interaction.guild.voice_client and interaction.guild.voice_client.is_playing():
            interaction.guild.voice_client.pause()
            await interaction.response.send_message("⏸️ **Pausado**")
        else:
            await interaction.response.send_message("❌ No hay nada reproduciéndose actualmente.")
    
    @bot.tree.command(name="resume", description="Reanuda la canción pausada")
    async def slash_resume(interaction: discord.Interaction):
        if interaction.guild.voice_client and interaction.guild.voice_client.is_paused():
            interaction.guild.voice_client.resume()
            await interaction.response.send_message("▶️ **Reproduciendo**")
        else:
            await interaction.response.send_message("❌ La reproducción no está pausada.")
    
    @bot.tree.command(name="stop", description="Detiene la música y limpia la cola")
    async def slash_stop(interaction: discord.Interaction):
        if interaction.guild.voice_client:
            music_cog = bot.get_cog('Music')
            await music_cog.cleanup(interaction.guild)
            await interaction.response.send_message("⏹️ **Música detenida y cola limpiada.**")
        else:
            await interaction.response.send_message("❌ No estoy conectado a un canal de voz.")
    
    @bot.tree.command(name="leave", description="Desconecta el bot del canal de voz")
    async def slash_leave(interaction: discord.Interaction):
        if interaction.guild.voice_client:
            music_cog = bot.get_cog('Music')
            await music_cog.cleanup(interaction.guild)
            await interaction.response.send_message("👋 **Desconectado del canal de voz.**")
        else:
            await interaction.response.send_message("❌ No estoy conectado a un canal de voz.")
    
    @bot.tree.command(name="volume", description="Cambia el volumen")
    @app_commands.describe(volumen="Nivel de volumen (0-100)")
    async def slash_volume(interaction: discord.Interaction, volumen: int):
        if interaction.guild.voice_client is None:
            return await interaction.response.send_message("❌ No estoy conectado a un canal de voz.")
        
        if not 0 <= volumen <= 100:
            return await interaction.response.send_message("❌ El volumen debe estar entre 0 y 100.")
        
        music_cog = bot.get_cog('Music')
        
        class MockContext:
            def __init__(self, interaction):
                self.bot = interaction.client
                self.guild = interaction.guild
                self.channel = interaction.channel
                self.author = interaction.user
                self.voice_client = interaction.guild.voice_client
        
        mock_ctx = MockContext(interaction)
        player = music_cog.get_player(mock_ctx)
        
        if interaction.guild.voice_client.source:
            interaction.guild.voice_client.source.volume = volumen / 100
        
        player.volume = volumen / 100
        await interaction.response.send_message(f"🔊 Volumen cambiado a **{volumen}%**")
    
    @bot.tree.command(name="join", description="Conecta el bot al canal de voz")
    async def slash_join(interaction: discord.Interaction):
        if interaction.user.voice is None:
            return await interaction.response.send_message("❌ No estás conectado a un canal de voz.")
        
        if interaction.guild.voice_client is not None:
            await interaction.guild.voice_client.move_to(interaction.user.voice.channel)
            return await interaction.response.send_message(f"🔊 Movido a **{interaction.user.voice.channel.name}**!")
        
        await interaction.user.voice.channel.connect()
        await interaction.response.send_message(f"✅ Conectado a **{interaction.user.voice.channel.name}**!")

async def setup(bot):
    """Registra el cog Music en el bot."""
    await bot.add_cog(Music(bot))
    await setup_slash_commands(bot)